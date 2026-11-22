import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PAY_METHODS, type Plan, type SchoolRow } from "@/lib/super";
import { rupees, todayPK, shortDate } from "@/lib/format";
import { PageHead, Stats, Stat, Chips, Empty, Bar } from "@/components/ilm";
import { billMonth, createInvoice, setInvoice } from "../actions";

type Inv = { id: string; number: string; school_id: string; school: string; plan: string | null; period: string; amount_paisa: number; due_on: string; status: "due" | "paid" | "void"; paid_on: string | null; method: string | null; reference: string | null; notes: string | null };
type Search = { f?: string; saved?: string; error?: string };

export default async function Billing({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [iv, sc, pl] = await Promise.all([supabase.rpc("super_invoices"), supabase.rpc("super_schools"), supabase.rpc("super_plans")]);
  const today = todayPK();
  const monthStart = today.slice(0, 8) + "01";
  const invoices = ((iv.data ?? []) as Inv[]).map((i) => ({ ...i, late: i.status === "due" && i.due_on < today }));
  const schools = (sc.data ?? []) as SchoolRow[];
  const plans = (pl.data ?? []) as Plan[];
  const price = (id: string) => plans.find((p) => p.id === id)?.price_paisa ?? 0;
  const mrr = schools.filter((s) => s.status === "active").reduce((t, s) => t + price(s.plan), 0);
  const filter = ["due", "overdue", "paid", "void"].includes(sp.f ?? "") ? sp.f! : "all";
  const list = invoices.filter((i) => filter === "all" || (filter === "overdue" ? i.late : i.status === filter));
  const thisMonth = invoices.filter((i) => i.status !== "void" && i.due_on >= monthStart);
  const billed = thisMonth.reduce((t, i) => t + i.amount_paisa, 0);
  const collected = invoices.filter((i) => i.status === "paid" && (i.paid_on ?? "") >= monthStart).reduce((t, i) => t + i.amount_paisa, 0);
  const late = invoices.filter((i) => i.late);
  const paid = invoices.filter((i) => i.status === "paid");
  const byMethod = PAY_METHODS.map(([id, label]) => ({ id, label, total: paid.filter((i) => i.method === id).reduce((t, i) => t + i.amount_paisa, 0) }));
  const paidTotal = Math.max(1, byMethod.reduce((t, m) => t + m.total, 0));
  const period = new Date(today).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  const due7 = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
  const btn = { minHeight: 34, padding: "0 10px", fontSize: 12 } as const;
  const tone = (i: (typeof invoices)[number]) => i.status === "paid" ? ["g", "Paid"] : i.status === "void" ? ["", "Cancelled"] : i.late ? ["r", `Overdue ${Math.round((Date.parse(today) - Date.parse(i.due_on)) / 86400000)} days`] : ["y", "Due"];

  return (
    <>
      <PageHead kick="Business" title="Billing and invoices" sub="What each school owes Ilmora, what came in and who is late. Paid by cash, JazzCash or Easypaisa." />
      {(sp.error || iv.error) && <div className="notice-bad">{sp.error ?? iv.error?.message}</div>}
      {sp.saved && <div className="notice-ok">{sp.saved.startsWith("billed-") ? `${sp.saved.slice(7)} invoice(s) created.` : "Saved."}</div>}
      <Stats>
        <Stat label="Monthly revenue" value={rupees(mrr)} tone="#15803d" sub="active schools × plan price" />
        <Stat label="Collected this month" value={rupees(collected)} sub={billed ? `${Math.round((collected / billed) * 100)}% of ${rupees(billed)} billed` : "nothing billed yet"} />
        <Stat label="Overdue" value={rupees(late.reduce((t, i) => t + i.amount_paisa, 0))} tone={late.length ? "#b91c1c" : undefined} sub={`${new Set(late.map((i) => i.school_id)).size} school(s)`} href="/super/billing?f=overdue" />
        <Stat label="Average per school" value={rupees(schools.filter((s) => s.status === "active").length ? mrr / schools.filter((s) => s.status === "active").length : 0)} sub="a month" />
      </Stats>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <form action={billMonth} className="card flex flex-col gap-3">
          <h2 className="h2">Bill every active school</h2>
          <p className="muted text-[13px]">One invoice per active school at its plan price. Schools already billed for this month are skipped. Plans with price 0 (custom deals) are skipped too: bill them one by one.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Month<input className="input" name="period" defaultValue={period} required /></label>
            <label className="field">Due date<input className="input" name="due_on" type="date" defaultValue={due7} required /></label>
          </div>
          <button className="btn self-start" type="submit">Create invoices</button>
        </form>
        <form action={createInvoice} className="card flex flex-col gap-3">
          <h2 className="h2">One invoice</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field sm:col-span-2">School<select className="input" name="school_id" required defaultValue="">
              <option value="" disabled>Choose a school</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.plan}{price(s.plan) ? ` · ${rupees(price(s.plan))}` : ""}</option>)}
            </select></label>
            <label className="field">Amount (Rs)<input className="input" name="amount" type="number" min={1} required inputMode="numeric" /></label>
            <label className="field">Due date<input className="input" name="due_on" type="date" defaultValue={due7} /></label>
            <label className="field">For<input className="input" name="period" defaultValue={period} placeholder="Nov 2026, setup fee…" /></label>
            <label className="field">Note<input className="input" name="notes" placeholder="optional" /></label>
          </div>
          <button className="btn self-start" type="submit">Create invoice</button>
        </form>
      </div>

      <section className="card">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Invoices</h2>
          <Chips label="Filter" current={filter} items={[["all", "All"], ["due", "Due"], ["overdue", "Overdue"], ["paid", "Paid"], ["void", "Cancelled"]].map(([id, label]) => ({ id, label, href: id === "all" ? "/super/billing" : `/super/billing?f=${id}` }))} />
        </div>
        <div className="tbl overflow-x-auto"><table className="w-full min-w-[980px]">
          <thead><tr>{["Invoice", "School", "For", "Amount", "Due", "Status", ""].map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
          <tbody>{list.map((i) => { const [tc, tl] = tone(i); return (
            <tr key={i.id}>
              <td className="font-black whitespace-nowrap">{i.number}</td>
              <td><Link href={`/super/${i.school_id}`} className="font-black text-[#0369a1]">{i.school}</Link><span className="muted block text-[12px] capitalize">{i.plan ?? ""}</span></td>
              <td className="text-[13px]">{i.period}{i.notes ? <span className="muted block text-[12px]">{i.notes}</span> : null}</td>
              <td className="font-black whitespace-nowrap tabular-nums">{rupees(i.amount_paisa)}</td>
              <td className="text-[13px] whitespace-nowrap">{shortDate(i.due_on)}</td>
              <td><span className={`tagx ${tc}`}>{tl}</span>{i.status === "paid" && <span className="muted block text-[12px]">{PAY_METHODS.find(([m]) => m === i.method)?.[1]} · {i.paid_on ? shortDate(i.paid_on) : ""}{i.reference ? ` · ${i.reference}` : ""}</span>}</td>
              <td>
                {i.status === "due" ? (
                  <div className="flex flex-wrap gap-1.5">
                    <form action={setInvoice} className="flex flex-wrap gap-1.5">
                      <input type="hidden" name="invoice_id" value={i.id} /><input type="hidden" name="status" value="paid" /><input type="hidden" name="back" value={filter === "all" ? "/super/billing" : `/super/billing?f=${filter}`} />
                      <select className="input" style={{ minHeight: 34, width: 120 }} name="method" aria-label={`How ${i.number} was paid`} required defaultValue="">
                        <option value="" disabled>Paid by…</option>{PAY_METHODS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
                      </select>
                      <input className="input" style={{ minHeight: 34, width: 120 }} name="reference" placeholder="TID / receipt" aria-label={`Reference for ${i.number}`} />
                      <button className="btn" style={btn} type="submit">Mark paid</button>
                    </form>
                    <form action={setInvoice}><input type="hidden" name="invoice_id" value={i.id} /><input type="hidden" name="status" value="void" />
                      <button className="btn-ghost" style={{ ...btn, color: "#b91c1c" }} type="submit">Cancel</button></form>
                  </div>
                ) : (
                  <form action={setInvoice}><input type="hidden" name="invoice_id" value={i.id} /><input type="hidden" name="status" value="due" />
                    <button className="btn-ghost" style={btn} type="submit">Undo</button></form>
                )}
              </td>
            </tr>); })}</tbody>
        </table></div>
        {list.length === 0 && <Empty>{invoices.length ? "No invoice matches." : "No invoices yet. Use “Bill every active school” above."}</Empty>}
      </section>

      <section className="card max-w-[640px]">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">How schools pay</h2><span className="muted text-[12px]">all paid invoices</span></div>
        <div className="mt-2.5">
          {byMethod.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-1 text-[13px] font-extrabold">
              <span className="w-24">{m.label}</span>
              <div className="flex-1"><Bar value={m.total / paidTotal} color={m.id === "jazzcash" ? "#ef4444" : m.id === "easypaisa" ? "#16a34a" : "#0ea5e9"} /></div>
              <span className="w-32 text-right">{rupees(m.total)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
