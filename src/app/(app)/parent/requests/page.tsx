import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate, todayPK } from "@/lib/format";
import { askLeave, bookMeeting, cancelMeeting } from "./actions";

const STATUS: Record<string, [string, string]> = { pending: ["Waiting", "pill-orange"], approved: ["Approved", "pill-green"], rejected: ["Refused", "pill-red"] };
const when = (ts: string) => new Date(ts).toLocaleString("en-GB", { timeZone: "Asia/Karachi", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// A parent asks for a child's leave and books a parent-teacher meeting.
export default async function ParentRequests({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("parent");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const [{ data: kids }, { data: leave }, { data: slots }, { data: staff }] = await Promise.all([
    supabase.from("students").select("id, full_name, section_id, sections(name, class_teacher_id, classes(name))").eq("status", "enrolled").order("full_name"),
    supabase.from("student_leave").select("id, student_id, from_on, to_on, reason, status, created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("ptm_slots").select("id, teacher_id, starts_at, minutes, place, student_id, note").gte("starts_at", new Date().toISOString()).order("starts_at").limit(200),
    supabase.from("profiles").select("id, full_name"),
  ]);
  type Kid = { id: string; full_name: string; section_id: string | null; sections: { name: string; class_teacher_id: string | null; classes: { name: string } } | null };
  const list = (kids ?? []) as unknown as Kid[];
  const name = new Map((staff ?? []).map((p) => [p.id, p.full_name]));
  const kidName = new Map(list.map((k) => [k.id, k.full_name.split(" ")[0]]));
  const mine = (slots ?? []).filter((s) => s.student_id);
  const open = (slots ?? []).filter((s) => !s.student_id);
  const byTeacher = [...open.reduce((m, s) => m.set(s.teacher_id, [...(m.get(s.teacher_id) ?? []), s]), new Map<string, typeof open>()).entries()];
  return (
    <>
      <div><h1 className="h1">Leave and meetings</h1><p className="muted text-base">Ask for your child&apos;s leave, and book a time to meet a teacher.</p></div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">{sp.saved === "leave" ? "Sent. The class teacher will approve or refuse it." : sp.saved === "booked" ? "Booked. The teacher sees it in their app." : "Cancelled."}</div>}
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <form action={askLeave} className="card">
          <h2 className="h2">Ask for leave</h2>
          {list.length === 0 ? <p className="muted">No children linked to your account yet.</p> : (
            <>
              <label className="field">Child<select className="input" name="student_id">{list.map((k) => <option key={k.id} value={k.id}>{k.full_name}{k.sections ? ` · ${k.sections.classes.name}-${k.sections.name}` : ""}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field">From<input className="input" type="date" name="from_on" required min={today} defaultValue={today} /></label>
                <label className="field">To<input className="input" type="date" name="to_on" min={today} /></label>
              </div>
              <label className="field">Reason<input className="input" name="reason" required placeholder="Fever, family wedding…" /></label>
              <button className="btn self-start" type="submit">Send request</button>
            </>
          )}
          {(leave ?? []).length > 0 && <h3 className="mt-2 font-black">Your requests</h3>}
          {(leave ?? []).map((l) => (
            <div key={l.id} className="row-box">
              <div className="flex-1"><div className="font-extrabold">{kidName.get(l.student_id)} · {shortDate(l.from_on)}{l.to_on !== l.from_on ? ` – ${shortDate(l.to_on)}` : ""}</div><div className="muted text-xs">{l.reason}</div></div>
              <span className={`pill ${STATUS[l.status][1]}`}>{STATUS[l.status][0]}</span>
            </div>
          ))}
        </form>
        <section className="card">
          <h2 className="h2">Parent-teacher meeting</h2>
          {mine.length > 0 && <h3 className="font-black">Your bookings</h3>}
          {mine.map((s) => (
            <form key={s.id} action={cancelMeeting} className="row-box">
              <input type="hidden" name="slot_id" value={s.id} />
              <div className="flex-1"><div className="font-extrabold">{when(s.starts_at)} · {name.get(s.teacher_id)}</div><div className="muted text-xs">For {kidName.get(s.student_id!) ?? "your child"} · {s.minutes} min{s.place ? ` · ${s.place}` : ""}</div></div>
              <button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Cancel</button>
            </form>
          ))}
          {byTeacher.length === 0 && <p className="muted">No meeting times open right now. Teachers add times before a PTM day.</p>}
          {byTeacher.map(([tid, times]) => (
            <form key={tid} action={bookMeeting} className="flex flex-col gap-2 rounded-2xl border-2 p-3" style={{ borderColor: "var(--line)" }}>
              <div className="font-black">{name.get(tid) ?? "Teacher"}</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="field">Time<select className="input" name="slot_id">{times.map((s) => <option key={s.id} value={s.id}>{when(s.starts_at)}{s.place ? ` · ${s.place}` : ""}</option>)}</select></label>
                <label className="field">About<select className="input" name="student_id">{list.map((k) => <option key={k.id} value={k.id}>{k.full_name.split(" ")[0]}</option>)}</select></label>
              </div>
              <label className="field">What to talk about (optional)<input className="input" name="note" placeholder="Maths marks, behaviour…" /></label>
              <button className="btn-ghost self-start" type="submit">Book</button>
            </form>
          ))}
        </section>
      </div>
    </>
  );
}
