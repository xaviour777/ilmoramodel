import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { FeesTabs } from "@/components/fees-tabs";
import { rupees, todayPK } from "@/lib/format";
import { addFeeHead, generateChallans, saveFeeStructure } from "../actions";

// making a month's challans for a big school can take longer than the default limit
export const maxDuration = 60;

type Search = { saved?: string; error?: string; made?: string; month?: string };

export default async function FeeSetupPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("accountant", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const [{ data: classes }, { data: heads }, { data: structures }, { data: months }] = await Promise.all([
    supabase.from("classes").select("id, name").order("sort"),
    supabase.from("fee_heads").select("id, name, priority").order("priority"),
    supabase.from("fee_structures").select("class_id, fee_head_id, amount_paisa, monthly"),
    supabase.from("invoices").select("billing_month").order("billing_month", { ascending: false }).limit(2000),
  ]);
  const amount = (c: string, h: string) => (structures ?? []).find((s) => s.class_id === c && s.fee_head_id === h);
  const monthlyHead = (h: string) => (structures ?? []).filter((s) => s.fee_head_id === h).every((s) => s.monthly);
  // challans made per month, newest first
  const perMonth = new Map<string, number>();
  for (const m of months ?? []) perMonth.set(m.billing_month, (perMonth.get(m.billing_month) ?? 0) + 1);
  const nextMonth = today.slice(0, 7);
  const admin = me.role !== "accountant";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Fees and challans</h1>
          <p className="muted text-base">Set each class&apos;s fee once, then make every family&apos;s challan for the month with one button.</p>
        </div>
        <FeesTabs current="setup" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {sp.made && (
        <div className="notice-ok">
          {sp.made} challans made. <Link href={`/print/challans?month=${sp.month}`} target="_blank" className="underline">Print them</Link> or send reminders from Fee reminders.
        </div>
      )}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <form action={saveFeeStructure} className="card flex-[2]">
          <h2 className="h2">Fee for each class (Rs)</h2>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th scope="col">Class</th>{(heads ?? []).map((h) => <th key={h.id} scope="col">{h.name}</th>)}</tr>
              </thead>
              <tbody>
                {(classes ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap">{c.name}</td>
                    {(heads ?? []).map((h) => (
                      <td key={h.id}>
                        <input className="input min-h-10 w-28 py-1 text-sm" name={`fee:${c.id}:${h.id}`} inputMode="numeric"
                          defaultValue={amount(c.id, h.id) ? Math.round(Number(amount(c.id, h.id)!.amount_paisa) / 100) : ""} aria-label={`${h.name} for ${c.name}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <fieldset className="field">
            <legend className="mb-1.5">Charged every month (untick for once-a-year heads like admission or annual fund)</legend>
            <div className="flex flex-wrap gap-2">
              {(heads ?? []).map((h) => (
                <label key={h.id} className="flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm" style={{ borderColor: "var(--line)" }}>
                  <input type="checkbox" name={`monthly:${h.id}`} defaultChecked={monthlyHead(h.id)} /> {h.name}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn self-start" type="submit">Save fees</button>
          <p className="muted">Leave a box empty when that class doesn&apos;t pay that head.</p>
        </form>

        <div className="flex flex-1 flex-col gap-5">
          <form action={generateChallans} className="card">
            <h2 className="h2">Make this month&apos;s challans</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">Month<input className="input" type="month" name="month" defaultValue={nextMonth} required /></label>
              <label className="field">Last date<input className="input" type="date" name="due_on" defaultValue={`${nextMonth}-10`} required /></label>
              <label className="field">Sibling concession %<input className="input" type="number" name="sibling_percent" min={0} max={100} defaultValue={0} /></label>
            </div>
            <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="one_time" className="h-5 w-5" /> Also add once-a-year heads this month</label>
            <button className="btn" type="submit">Make challans</button>
            <p className="muted">Unpaid dues from earlier months show on the new challan by themselves. Families who already have this month&apos;s challan are skipped.</p>
          </form>

          <section className="card">
            <h2 className="h2">Challans made</h2>
            {perMonth.size === 0 && <p className="muted">None yet.</p>}
            {[...perMonth.entries()].slice(0, 6).map(([m, n]) => (
              <div key={m} className="flex items-center justify-between gap-2 font-extrabold">
                <span>{new Date(m + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })} · {n} families</span>
                <Link href={`/print/challans?month=${m.slice(0, 7)}`} target="_blank" className="eyebrow">Print</Link>
              </div>
            ))}
          </section>

          {admin && (
            <form action={addFeeHead} className="card">
              <h2 className="h2">Fee heads</h2>
              <div className="flex flex-wrap gap-1.5">{(heads ?? []).map((h) => <span key={h.id} className="pill pill-gray">{h.name}</span>)}</div>
              <div className="flex gap-2"><input className="input" name="name" required placeholder="Transport, Admission fee" aria-label="New fee head" /><button className="btn-ghost" type="submit">Add</button></div>
            </form>
          )}
          <p className="muted">Total of one family with one child in the top class: {rupees((structures ?? []).filter((s) => s.class_id === (classes ?? []).at(-1)?.id && s.monthly).reduce((t, s) => t + Number(s.amount_paisa), 0))} a month.</p>
        </div>
      </div>
    </>
  );
}
