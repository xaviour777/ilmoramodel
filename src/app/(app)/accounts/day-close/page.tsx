import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { FeesTabs } from "@/components/fees-tabs";
import { SendButton } from "@/components/send-button";
import { mobilePK } from "@/lib/messages";
import { rupees, shortDate, todayPK } from "@/lib/format";
import { cashForDay } from "@/lib/day-close";
import { closeDay } from "../money-actions";

type Search = { date?: string; cashier?: string; saved?: string; error?: string };

// The cashier counts the drawer at the end of the day; Ilmora says what should be there.
export default async function DayClose({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("accountant", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") && sp.date! <= today ? sp.date! : today;
  const admin = me.role !== "accountant";
  const [{ data: cashiers }, { data: closes }, { data: owner }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").in("role", ["accountant", "principal", "owner"]).eq("is_active", true).order("full_name"),
    supabase.from("day_closes").select("*, profiles!day_closes_cashier_id_fkey(full_name)").order("date", { ascending: false }).limit(30),
    supabase.from("profiles").select("full_name, phone, role").in("role", ["owner", "principal"]).not("phone", "is", null).order("role", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const cashier = admin ? (sp.cashier || me.id) : me.id;
  const who = (cashiers ?? []).find((c) => c.id === cashier);
  const c = await cashForDay(supabase, date, cashier);
  type Close = { id: string; date: string; cashier_id: string; cash_received_paisa: number; cash_spent_paisa: number; jazzcash_paisa: number; easypaisa_paisa: number; counted_paisa: number; deposited_paisa: number; deposit_ref: string | null; difference_paisa: number; note: string | null; profiles: { full_name: string } | null };
  const list = ((closes ?? []) as unknown as Close[]).filter((x) => admin || x.cashier_id === me.id);
  const done = list.find((x) => x.date === date && x.cashier_id === cashier);
  const ownerPhone = mobilePK(owner?.phone ?? "");
  const summary = done ? `${me.campus_name} day close ${shortDate(date)}, ${done.profiles?.full_name ?? who?.full_name}: cash ${rupees(Number(done.cash_received_paisa))}, JazzCash ${rupees(Number(done.jazzcash_paisa))}, Easypaisa ${rupees(Number(done.easypaisa_paisa))}, cash spent ${rupees(Number(done.cash_spent_paisa))}. Counted ${rupees(Number(done.counted_paisa))}${Number(done.difference_paisa) ? `, ${Number(done.difference_paisa) < 0 ? "SHORT" : "extra"} ${rupees(Math.abs(Number(done.difference_paisa)))}` : ", matches"}. Deposited ${rupees(Number(done.deposited_paisa))}${done.deposit_ref ? ` (${done.deposit_ref})` : ""}.` : "";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Day close</h1>
          <p className="muted text-base">Count the cash at the end of the day. Ilmora shows what should be in the drawer and keeps the record.</p>
        </div>
        <FeesTabs current="close" salaries={me.role === "accountant"} />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Day closed.</div>}

      <form className="flex flex-wrap items-end gap-2">
        <label className="field">Day<input className="input" type="date" name="date" defaultValue={date} max={today} /></label>
        {admin && (
          <label className="field">Cashier
            <select className="input" name="cashier" defaultValue={cashier}>{(cashiers ?? []).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select>
          </label>
        )}
        <button className="btn-ghost" type="submit">Show</button>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tile"><span className="muted">Cash fees taken</span><b>{rupees(c.cash)}</b><span className="muted text-xs">{c.receipts} receipts in all</span></div>
        <div className="tile"><span className="muted">Cash expenses paid</span><b>{rupees(c.cashSpent)}</b><span className="muted text-xs">from Expenses</span></div>
        <div className="tile"><span className="muted">Should be in drawer</span><b>{rupees(c.expected)}</b><span className="muted text-xs">cash taken minus cash spent</span></div>
        <div className="tile"><span className="muted">JazzCash / Easypaisa</span><b>{rupees(c.jazzcash + c.easypaisa)}</b><span className="muted text-xs">{rupees(c.jazzcash)} + {rupees(c.easypaisa)}, check the wallets</span></div>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <form action={closeDay} className="card flex-1">
          <h2 className="h2">{done ? "Closed. Count again?" : "Close the day"} · {who?.full_name} · {shortDate(date)}</h2>
          <input type="hidden" name="date" value={date} /><input type="hidden" name="cashier_id" value={cashier} />
          <div className="grid gap-3 md:grid-cols-3">
            <label className="field">Cash counted (Rs)<input className="input" name="counted" inputMode="numeric" required defaultValue={done ? Math.round(Number(done.counted_paisa) / 100) : ""} /></label>
            <label className="field">Deposited (Rs)<input className="input" name="deposited" inputMode="numeric" defaultValue={done ? Math.round(Number(done.deposited_paisa) / 100) : ""} placeholder="To bank or owner" /></label>
            <label className="field">Deposit slip / reference<input className="input" name="deposit_ref" defaultValue={done?.deposit_ref ?? ""} /></label>
          </div>
          <label className="field">Note<input className="input" name="note" defaultValue={done?.note ?? ""} placeholder="Why short or extra, if it is" /></label>
          <button className="btn self-start" type="submit">{done ? "Save again" : "Close day"}</button>
          {done && (
            <div className={Number(done.difference_paisa) < 0 ? "notice-bad" : "notice-ok"}>
              {Number(done.difference_paisa) === 0 ? "Cash matches." : Number(done.difference_paisa) < 0 ? `Short by ${rupees(-Number(done.difference_paisa))}.` : `Extra ${rupees(Number(done.difference_paisa))}.`}
            </div>
          )}
          {done && ownerPhone && <SendButton channel="whatsapp" phone={ownerPhone} body={summary} kind="day_close" label={`Send summary to ${owner?.full_name} on WhatsApp`} />}
        </form>

        <section className="card flex-1">
          <h2 className="h2">Last closes</h2>
          {list.length === 0 && <p className="muted">No day closed yet.</p>}
          {list.slice(0, 14).map((x) => (
            <div key={x.id} className="flex flex-wrap justify-between gap-2 text-sm font-bold">
              <span>{shortDate(x.date)}{admin ? ` · ${x.profiles?.full_name ?? ""}` : ""}</span>
              <span className="tabular-nums">counted {rupees(Number(x.counted_paisa))} ·{" "}
                <span style={{ color: Number(x.difference_paisa) < 0 ? "var(--red-ink)" : Number(x.difference_paisa) > 0 ? "var(--orange-ink)" : "var(--green-ink)" }}>
                  {Number(x.difference_paisa) === 0 ? "matches" : Number(x.difference_paisa) < 0 ? `short ${rupees(-Number(x.difference_paisa))}` : `extra ${rupees(Number(x.difference_paisa))}`}
                </span>
              </span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
