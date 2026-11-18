import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate, todayPK } from "@/lib/format";
import { decideLeave, openSlots, removeSlot } from "./actions";

const when = (ts: string) => new Date(ts).toLocaleString("en-GB", { timeZone: "Asia/Karachi", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// The class teacher decides children's leave; any teacher opens meeting times for parents.
export default async function TeacherRequests({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: leave }, { data: slots }] = await Promise.all([
    supabase.from("student_leave").select("id, from_on, to_on, reason, status, created_at, students(full_name, roll_no, sections(name, classes(name)))").order("status").order("created_at", { ascending: false }).limit(50),
    supabase.from("ptm_slots").select("id, starts_at, minutes, place, note, students(full_name, sections(name, classes(name)))").eq("teacher_id", me.id).gte("starts_at", new Date(Date.now() - 864e5).toISOString()).order("starts_at"),
  ]);
  type L = { id: string; from_on: string; to_on: string; reason: string; status: string; students: { full_name: string; roll_no: string | null; sections: { name: string; classes: { name: string } } | null } | null };
  type S = { id: string; starts_at: string; minutes: number; place: string | null; note: string | null; students: { full_name: string; sections: { name: string; classes: { name: string } } | null } | null };
  const L = (leave ?? []) as unknown as L[];
  const pending = L.filter((l) => l.status === "pending");
  const booked = ((slots ?? []) as unknown as S[]).filter((s) => s.students);
  const open = ((slots ?? []) as unknown as S[]).filter((s) => !s.students);
  const saved = sp.saved?.startsWith("slots-") ? `${sp.saved.slice(6)} meeting times opened.` : sp.saved ? "Done." : null;
  return (
    <>
      <div><h1 className="h1">Leave requests and meetings</h1><p className="muted text-base">Approve children&apos;s leave (the days are marked as leave in attendance), and open times for parents to meet you.</p></div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {saved && <div className="notice-ok">{saved}</div>}
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <h2 className="h2">Children&apos;s leave · {pending.length} waiting</h2>
          {L.length === 0 && <p className="muted">No requests from parents.</p>}
          {L.map((l) => (
            <form key={l.id} action={decideLeave} className="row-box flex-wrap">
              <input type="hidden" name="leave_id" value={l.id} />
              <div className="min-w-40 flex-1"><div className="font-extrabold">{l.students?.full_name}{l.students?.sections ? ` · ${l.students.sections.classes.name}-${l.students.sections.name}` : ""}</div>
                <div className="muted text-xs">{shortDate(l.from_on)}{l.to_on !== l.from_on ? ` – ${shortDate(l.to_on)}` : ""} · {l.reason}</div></div>
              {l.status === "pending" ? <>
                <button className="btn min-h-10 px-4 text-sm" name="status" value="approved" type="submit">Approve</button>
                <button className="btn-ghost min-h-10 px-4 text-sm" name="status" value="rejected" type="submit">Refuse</button>
              </> : <span className={`pill ${l.status === "approved" ? "pill-green" : "pill-red"}`}>{l.status === "approved" ? "Approved" : "Refused"}</span>}
            </form>
          ))}
        </section>
        <section className="card">
          <h2 className="h2">Parent-teacher meetings</h2>
          <form action={openSlots} className="grid grid-cols-2 items-end gap-2 md:grid-cols-3">
            <label className="field">Day<input className="input" type="date" name="day" required min={todayPK()} /></label>
            <label className="field">From<input className="input" type="time" name="from" required defaultValue="09:00" /></label>
            <label className="field">To<input className="input" type="time" name="to" required defaultValue="12:00" /></label>
            <label className="field">Each meeting (min)<input className="input" type="number" name="minutes" min={5} max={60} defaultValue={10} /></label>
            <label className="field">Place<input className="input" name="place" placeholder="Room 12" /></label>
            <button className="btn" type="submit">Open times</button>
          </form>
          {booked.length > 0 && <h3 className="mt-2 font-black">Booked · {booked.length}</h3>}
          {booked.map((s) => (
            <div key={s.id} className="row-box"><div className="flex-1"><div className="font-extrabold">{when(s.starts_at)} · {s.students?.full_name}{s.students?.sections ? ` (${s.students.sections.classes.name}-${s.students.sections.name})` : ""}</div>
              {s.note && <div className="muted text-xs">{s.note}</div>}</div></div>
          ))}
          {open.length > 0 && <h3 className="mt-2 font-black">Still open · {open.length}</h3>}
          {open.slice(0, 30).map((s) => (
            <form key={s.id} action={removeSlot} className="flex items-center justify-between gap-2 text-sm font-bold"><input type="hidden" name="slot_id" value={s.id} /><span>{when(s.starts_at)}{s.place ? ` · ${s.place}` : ""}</span><button className="muted text-xs underline" type="submit">Remove</button></form>
          ))}
          {booked.length + open.length === 0 && <p className="muted">No meeting times yet.</p>}
        </section>
      </div>
    </>
  );
}
