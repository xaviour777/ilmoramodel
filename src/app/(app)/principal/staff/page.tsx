import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate, time, todayPK } from "@/lib/format";
import { addStaff, assignSubstitute, decideLeave } from "../actions";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const weekday = ((new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;

  const [{ data: pending }, { data: away }, { data: staff }, { data: slots }, { data: subs }] = await Promise.all([
    supabase.from("leave_requests").select("id, from_on, to_on, reason, profiles!leave_requests_profile_id_fkey(full_name)").eq("status", "pending").order("from_on"),
    supabase.from("leave_requests").select("profile_id, profiles!leave_requests_profile_id_fkey(full_name)").eq("status", "approved").lte("from_on", today).gte("to_on", today),
    supabase.from("profiles").select("id, full_name, role, phone, user_id").in("role", ["principal", "teacher", "accountant"]).order("role").order("full_name"),
    weekday <= 6
      ? supabase.from("timetable_slots").select("id, teacher_id, period_id, periods!inner(name, starts_at, sort, timing_profiles!inner(is_active)), subjects(name), sections(name, classes(name))").eq("weekday", weekday).eq("periods.timing_profiles.is_active", true)
      : Promise.resolve({ data: [] }),
    supabase.from("substitutions").select("timetable_slot_id, substitute_id").eq("date", today),
  ]);

  type Slot = { id: string; teacher_id: string | null; period_id: string; periods: { name: string; starts_at: string; sort: number }; subjects: { name: string }; sections: { name: string; classes: { name: string } } };
  const all = (slots ?? []) as unknown as Slot[];
  const awayIds = new Set((away ?? []).map((a) => a.profile_id));
  const uncovered = all.filter((s) => s.teacher_id && awayIds.has(s.teacher_id)).sort((a, b) => a.periods.sort - b.periods.sort);
  const subFor = new Map((subs ?? []).map((s) => [s.timetable_slot_id, s.substitute_id]));
  const teachers = (staff ?? []).filter((s) => s.role === "teacher");
  const busy = (periodId: string) => new Set(all.filter((s) => s.period_id === periodId).map((s) => s.teacher_id));
  const name = (p: unknown) => (p as { full_name: string } | null)?.full_name ?? "";

  return (
    <>
      <div>
        <h1 className="h1">Staff, leave and substitutes</h1>
        <p className="muted text-base">Approve leave, then cover the periods of anyone away today.</p>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card">
          <h2 className="h2">Leave requests</h2>
          {(pending ?? []).length === 0 && <p className="muted">Nothing waiting.</p>}
          {(pending ?? []).map((l) => (
            <form key={l.id} action={decideLeave} className="row-box flex-wrap">
              <input type="hidden" name="leave_id" value={l.id} />
              <div className="min-w-40 flex-1">
                <div className="font-extrabold">{name(l.profiles)}</div>
                <div className="muted text-xs">{shortDate(l.from_on)}{l.to_on !== l.from_on ? ` to ${shortDate(l.to_on)}` : ""} · {l.reason}</div>
              </div>
              <button className="btn min-h-10 px-4 text-sm" name="status" value="approved" type="submit">Approve</button>
              <button className="btn-ghost min-h-10 px-4 text-sm" name="status" value="rejected" type="submit">Reject</button>
            </form>
          ))}
        </section>

        <section className="card">
          <h2 className="h2">Cover today&apos;s periods</h2>
          <p className="muted">{awayIds.size} teacher{awayIds.size === 1 ? "" : "s"} on leave today</p>
          {uncovered.length === 0 && <p className="muted">No periods need cover.</p>}
          {uncovered.map((s) => {
            const taken = busy(s.period_id);
            const free = teachers.filter((t) => !taken.has(t.id) && !awayIds.has(t.id));
            const current = subFor.get(s.id);
            return (
              <form key={s.id} action={assignSubstitute} className="row-box flex-wrap">
                <input type="hidden" name="slot_id" value={s.id} /><input type="hidden" name="date" value={today} /><input type="hidden" name="absent_teacher_id" value={s.teacher_id ?? ""} />
                <b className="w-14 text-sm tabular-nums">{time(s.periods.starts_at)}</b>
                <div className="min-w-32 flex-1">
                  <div className="font-extrabold">{s.sections.classes.name}-{s.sections.name} {s.subjects.name}</div>
                  <div className="muted text-xs">{s.periods.name} · {current ? "covered" : "needs cover"}</div>
                </div>
                <select className="input min-h-10 w-44 py-1 text-sm" name="substitute_id" defaultValue={current ?? ""} aria-label="Substitute teacher">
                  <option value="">Pick a free teacher</option>
                  {free.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
                <button className="btn min-h-10 px-4 text-sm" type="submit">Assign</button>
              </form>
            );
          })}
        </section>

        <section className="card">
          <h2 className="h2">Staff</h2>
          {(staff ?? []).map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <span className={`pill ${s.role === "teacher" ? "pill-blue" : s.role === "principal" ? "pill-purple" : "pill-orange"}`}>{s.role}</span>
              <span className="flex-1 font-extrabold">{s.full_name}</span>
              <span className="muted text-xs">{s.user_id ? "can log in" : "no login yet"}</span>
            </div>
          ))}
        </section>

        <form action={addStaff} className="card">
          <h2 className="h2">Add a staff member</h2>
          <label className="field">Full name<input className="input" name="full_name" required /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Role<select className="input" name="role"><option value="teacher">Teacher</option><option value="accountant">Accountant</option></select></label>
            <label className="field">Phone<input className="input" name="phone" inputMode="tel" placeholder="03001234567" /></label>
          </div>
          <label className="field">Email for login<input className="input" name="email" type="email" /></label>
          <button className="btn" type="submit">Add</button>
          <p className="muted">They can sign in once a login is created for this email (see the README).</p>
        </form>
      </div>
    </>
  );
}
