import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { StaffTabs } from "@/components/staff-tabs";
import { FeesTabs } from "@/components/fees-tabs";
import { SendButton } from "@/components/send-button";
import { mobilePK } from "@/lib/messages";
import { rupees, todayPK } from "@/lib/format";
import { PAY_MODE } from "@/lib/payroll";
import { makeSalarySheet, paySalary, updateSalary } from "../actions";

type Row = {
  id: string; profile_id: string; basic_paisa: number; allowance_paisa: number; bonus_paisa: number; absent_days: number;
  absence_cut_paisa: number; other_cut_paisa: number; advance_cut_paisa: number; net_paisa: number; status: string;
  paid_on: string | null; pay_mode: string | null; reference: string | null; note: string | null;
  profiles: { full_name: string; phone: string | null; role: string } | null;
};
const rs = (p: number) => String(Math.round(Number(p) / 100));

// The month's salary sheet: make it from each person's salary, absences and advances, adjust, then pay.
export default async function SalariesPage({ searchParams }: { searchParams: Promise<{ month?: string; saved?: string; error?: string }> }) {
  const me = await requireRole("principal", "owner", "accountant");
  const sp = await searchParams;
  const supabase = await createClient();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayPK().slice(0, 7);
  const [{ data }, { data: details }] = await Promise.all([
    supabase.from("salary_payments").select("*, profiles!salary_payments_profile_id_fkey(full_name, phone, role)").eq("month", `${month}-01`),
    supabase.from("staff_details").select("profile_id, account_no, wallet_no, bank_name"),
  ]);
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? ""));
  const det = new Map((details ?? []).map((d) => [d.profile_id, d]));
  const total = rows.reduce((t, r) => t + Number(r.net_paisa), 0);
  const paid = rows.filter((r) => r.status === "paid").reduce((t, r) => t + Number(r.net_paisa), 0);
  const monthName = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const made = sp.saved?.startsWith("made-") ? sp.saved.slice(5) : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Salaries</h1>
          <p className="muted text-base">{monthName}: make the sheet, check it, pay, and send each person their payslip.</p>
        </div>
        {me.role !== "accountant" ? <StaffTabs current="salaries" /> : <FeesTabs current="salaries" salaries />}
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {made ? <div className="notice-ok">{made} salaries made. Check them below.</div> : sp.saved && <div className="notice-ok">Saved.</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tile"><span className="muted">Salaries this month</span><b>{rupees(total)}</b><span className="muted text-xs">{rows.length} people</span></div>
        <div className="tile"><span className="muted">Paid</span><b>{rupees(paid)}</b><span className="muted text-xs">{rows.filter((r) => r.status === "paid").length} people</span></div>
        <div className="tile"><span className="muted">Still to pay</span><b>{rupees(total - paid)}</b><span className="muted text-xs">{rows.filter((r) => r.status !== "paid").length} people</span></div>
        <div className="tile"><span className="muted">Advances cut</span><b>{rupees(rows.reduce((t, r) => t + Number(r.advance_cut_paisa), 0))}</b><span className="muted text-xs">this month</span></div>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <section className="card flex-[3]">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <form className="flex items-end gap-2">
              <label className="field">Month<input className="input" type="month" name="month" defaultValue={month} /></label>
              <button className="btn-ghost" type="submit">Show</button>
            </form>
            {rows.length > 0 && <Link href={`/print/payslip/sheet?month=${month}`} target="_blank" className="eyebrow">Print salary sheet</Link>}
          </div>
          {rows.length === 0 && <p className="muted">No salaries for {monthName} yet. Make them with the button on the right.</p>}
          {rows.map((r) => {
            const d = det.get(r.profile_id);
            const phone = mobilePK(r.profiles?.phone ?? "");
            const slip = `${me.campus_name}: your salary for ${monthName} is ${rupees(Number(r.net_paisa))}${r.status === "paid" ? `, paid by ${PAY_MODE[r.pay_mode ?? "cash"]}` : ""}. Basic ${rupees(Number(r.basic_paisa))}, allowances ${rupees(Number(r.allowance_paisa))}${Number(r.bonus_paisa) ? `, bonus ${rupees(Number(r.bonus_paisa))}` : ""}${Number(r.absence_cut_paisa) ? `, ${r.absent_days} absent days -${rupees(Number(r.absence_cut_paisa))}` : ""}${Number(r.advance_cut_paisa) ? `, advance -${rupees(Number(r.advance_cut_paisa))}` : ""}${Number(r.other_cut_paisa) ? `, other -${rupees(Number(r.other_cut_paisa))}` : ""}.`;
            return (
              <div key={r.id} className="flex flex-col gap-2 rounded-2xl border-2 p-3" style={{ borderColor: "var(--line)" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/principal/staff/${r.profile_id}`} className="font-black hover:underline">{r.profiles?.full_name}</Link>
                  <span className="flex items-center gap-2 font-black tabular-nums">{rupees(Number(r.net_paisa))}
                    <span className={`pill ${r.status === "paid" ? "pill-green" : "pill-orange"}`}>{r.status === "paid" ? "paid" : "due"}</span></span>
                </div>
                <div className="muted text-xs">
                  Basic {rupees(Number(r.basic_paisa))} + allowances {rupees(Number(r.allowance_paisa))}
                  {r.absent_days ? ` · ${r.absent_days} absent days${Number(r.absence_cut_paisa) ? ` (-${rupees(Number(r.absence_cut_paisa))})` : ""}` : ""}
                  {d?.account_no ? ` · ${d.bank_name ?? "Bank"} ${d.account_no}` : d?.wallet_no ? ` · wallet ${d.wallet_no}` : ""}
                </div>
                {r.status !== "paid" ? (
                  <>
                    <form action={updateSalary} className="grid items-end gap-2 md:grid-cols-[repeat(3,minmax(0,7rem))_1fr_auto]">
                      <input type="hidden" name="salary_id" value={r.id} /><input type="hidden" name="month" value={month} />
                      <label className="field text-xs">Bonus<input className="input min-h-10 py-1 text-sm" name="bonus" inputMode="numeric" defaultValue={rs(r.bonus_paisa)} /></label>
                      <label className="field text-xs">Advance cut<input className="input min-h-10 py-1 text-sm" name="advance_cut" inputMode="numeric" defaultValue={rs(r.advance_cut_paisa)} /></label>
                      <label className="field text-xs">Other cut<input className="input min-h-10 py-1 text-sm" name="other_cut" inputMode="numeric" defaultValue={rs(r.other_cut_paisa)} /></label>
                      <label className="field text-xs">Note<input className="input min-h-10 py-1 text-sm" name="note" defaultValue={r.note ?? ""} /></label>
                      <div className="flex gap-2">
                        <button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Update</button>
                        <button className="muted text-xs underline" type="submit" name="remove" value="1">Remove</button>
                      </div>
                    </form>
                    <form action={paySalary} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="salary_id" value={r.id} /><input type="hidden" name="month" value={month} />
                      <select className="input min-h-10 w-40 py-1 text-sm" name="pay_mode" defaultValue={r.pay_mode ?? "bank"} aria-label="Paid by">
                        {Object.entries(PAY_MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input className="input min-h-10 flex-1 py-1 text-sm" name="reference" placeholder="Bank / wallet transaction ID" aria-label="Reference" />
                      <input className="input min-h-10 w-40 py-1 text-sm" type="date" name="paid_on" defaultValue={todayPK()} aria-label="Paid on" />
                      <button className="btn min-h-10 px-4 text-sm" type="submit">Mark paid</button>
                    </form>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    <span className="flex-1">Paid by {PAY_MODE[r.pay_mode ?? "cash"]}{r.reference ? ` · ${r.reference}` : ""}</span>
                    <Link href={`/print/payslip/${r.id}`} target="_blank" className="btn-ghost min-h-10 px-3 text-sm">Payslip</Link>
                    {phone && <SendButton channel="whatsapp" phone={phone} body={slip} kind="payslip" label="Payslip on WhatsApp" />}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <form action={makeSalarySheet} className="card flex-1">
          <h2 className="h2">Make {monthName}&apos;s salaries</h2>
          <input type="hidden" name="month" value={month} />
          <p className="muted">Uses each person&apos;s salary from their staff record, their absent days from staff attendance, and the advance cut that is due.</p>
          <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="cut_absence" className="h-5 w-5" /> Cut absent days (basic ÷ 30 a day)</label>
          <button className="btn" type="submit">Make salaries</button>
          <p className="muted">People who already have this month&apos;s salary are skipped. Anyone without a salary set is left out: open their name on Staff &amp; leave.</p>
        </form>
      </div>
    </>
  );
}
