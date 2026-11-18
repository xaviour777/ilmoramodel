import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { rupees, shortDate, todayPK } from "@/lib/format";
import { requestLeave } from "../actions";

const PILL: Record<string, string> = { pending: "pill-orange", approved: "pill-green", rejected: "pill-red" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole("teacher", "accountant", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: mine }, { data: allow }, { data: pay }] = await Promise.all([
    supabase.from("leave_requests").select("*").eq("profile_id", me.id).order("from_on", { ascending: false }),
    supabase.rpc("my_leave_allowance"),
    supabase.from("salary_payments").select("*").eq("profile_id", me.id).order("month", { ascending: false }).limit(12),
  ]);
  const year = todayPK().slice(0, 4);
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
  const used = (mine ?? []).filter((l) => l.status === "approved" && l.from_on.startsWith(year)).reduce((n, l) => n + days(l.from_on, l.to_on), 0);
  const allowance = Number(allow ?? 12);
  return (
    <>
      <div>
        <h1 className="h1">Leave</h1>
        <p className="muted text-base">Ask for leave here. The principal approves it and arranges substitutes for your periods.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="tile"><span className="muted">Allowed in {year}</span><b>{allowance} days</b></div>
        <div className="tile"><span className="muted">Taken</span><b>{used} days</b></div>
        <div className="tile"><span className="muted">Left</span><b style={{ color: allowance - used < 0 ? "var(--red-ink)" : undefined }}>{allowance - used} days</b></div>
      </div>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <form action={requestLeave} className="card xl:w-[400px]">
          <h2 className="h2">Request leave</h2>
          {sp.saved && <div className="notice-ok">Sent to the principal.</div>}
          {sp.error && <div className="notice-bad">{sp.error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <label className="field">From<input className="input" type="date" name="from_on" required min={todayPK()} /></label>
            <label className="field">To<input className="input" type="date" name="to_on" required min={todayPK()} /></label>
          </div>
          <label className="field">Reason<input className="input" name="reason" placeholder="Family wedding" /></label>
          <button className="btn" type="submit">Send request</button>
        </form>
        <section className="card flex-1">
          <h2 className="h2">My requests</h2>
          {(mine ?? []).length === 0 && <p className="muted">No leave requests yet.</p>}
          {(mine ?? []).map((l) => (
            <div key={l.id} className="row-box">
              <div className="flex-1">
                <div className="font-extrabold">{shortDate(l.from_on)}{l.to_on !== l.from_on ? ` to ${shortDate(l.to_on)}` : ""}</div>
                <div className="muted text-xs">{l.reason}</div>
              </div>
              <span className={`pill ${PILL[l.status]}`}>{l.status}</span>
            </div>
          ))}
        </section>
      </div>
      <section className="card">
        <h2 className="h2">My payslips</h2>
        {(pay ?? []).length === 0 && <p className="muted">No salary recorded yet.</p>}
        {(pay ?? []).map((p) => (
          <details key={p.id} className="row-box flex-col items-stretch">
            <summary className="flex cursor-pointer items-center justify-between gap-2 font-extrabold">
              <span>{new Date(p.month).toLocaleDateString("en-PK", { month: "long", year: "numeric" })}</span>
              <span className="flex items-center gap-2">{rupees(p.net_paisa)}<span className={`pill ${p.status === "paid" ? "pill-green" : "pill-orange"}`}>{p.status === "paid" ? `paid ${p.paid_on ? shortDate(p.paid_on) : ""}` : "due"}</span></span>
            </summary>
            <div className="mt-2 grid gap-1 text-sm">
              {([["Basic", p.basic_paisa], ["Allowance", p.allowance_paisa], ["Bonus", p.bonus_paisa], [`Absence cut (${p.absent_days} days)`, -p.absence_cut_paisa], ["Advance cut", -p.advance_cut_paisa], ["Other cut", -p.other_cut_paisa]] as [string, number][]).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span>{k}</span><span className="tabular-nums">{v < 0 ? "− " : ""}{rupees(Math.abs(v))}</span></div>
              ))}
              <div className="flex justify-between border-t pt-1 font-black" style={{ borderColor: "var(--line)" }}><span>Net</span><span>{rupees(p.net_paisa)}</span></div>
              {p.pay_mode && <div className="muted text-xs">By {p.pay_mode}{p.reference ? ` · ${p.reference}` : ""}</div>}
            </div>
          </details>
        ))}
      </section>
    </>
  );
}
