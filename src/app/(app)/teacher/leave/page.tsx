import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate, todayPK } from "@/lib/format";
import { requestLeave } from "../actions";

const PILL: Record<string, string> = { pending: "pill-orange", approved: "pill-green", rejected: "pill-red" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole("teacher", "accountant", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: mine } = await supabase.from("leave_requests").select("*").eq("profile_id", me.id).order("from_on", { ascending: false });
  return (
    <>
      <div>
        <h1 className="h1">Leave</h1>
        <p className="muted text-base">Ask for leave here. The principal approves it and arranges substitutes for your periods.</p>
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
    </>
  );
}
