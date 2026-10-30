import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { ClassesTabs } from "@/components/classes-tabs";
import { pct, rupees, todayPK } from "@/lib/format";
import { CHOICE_LABEL } from "@/lib/messages";
import { saveFamily, saveStudent } from "../actions";

const STATUS: Record<string, string> = { enrolled: "Studying", left: "Left the school", struck_off: "Struck off" };

export default async function StudentProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("principal", "owner");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: s } = await supabase.from("students")
    .select("*, families(id, name, phone, address, reminder_phone, reminder_channel), sections(name, classes(name))").eq("id", id).maybeSingle();
  if (!s) notFound();
  const since = new Date(Date.parse(todayPK()) - 29 * 86400000).toISOString().slice(0, 10);
  const [{ data: sections }, { data: att }, { data: bal }, { data: siblings }, { data: marks }] = await Promise.all([
    supabase.from("sections").select("id, name, classes(name, sort)"),
    supabase.from("attendance").select("status").eq("student_id", id).gte("date", since),
    supabase.from("family_balances").select("balance_paisa").eq("family_id", s.family_id).maybeSingle(),
    supabase.from("students").select("id, full_name, sections(name, classes(name))").eq("family_id", s.family_id).neq("id", id),
    supabase.from("marks").select("obtained, is_absent, exams(id, name, total_marks, starts_on)").eq("student_id", id),
  ]);
  type Sec = { id: string; name: string; classes: { name: string; sort: number } };
  const secs = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const present = (att ?? []).filter((a) => a.status === "present" || a.status === "late").length;
  const fam = s.families as { id: string; name: string; phone: string | null; address: string | null; reminder_phone: string | null; reminder_channel: string };
  // one line per exam: total obtained out of total possible
  type M = { obtained: number | null; is_absent: boolean; exams: { id: string; name: string; total_marks: number; starts_on: string | null } };
  const byExam = new Map<string, { name: string; got: number; out: number; date: string }>();
  for (const m of (marks ?? []) as unknown as M[]) {
    const e = byExam.get(m.exams.id) ?? { name: m.exams.name, got: 0, out: 0, date: m.exams.starts_on ?? "" };
    e.got += Number(m.obtained ?? 0); e.out += m.exams.total_marks; byExam.set(m.exams.id, e);
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/principal/students" className="eyebrow">‹ All students</Link>
          <h1 className="h1">{s.full_name}</h1>
          <p className="muted text-base">{s.sections ? `${s.sections.classes.name}-${s.sections.name}` : "No class"} · {STATUS[s.status]}{s.roll_no ? ` · Roll ${s.roll_no}` : ""}</p>
        </div>
        <ClassesTabs current="students" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tile"><span className="muted">Attendance, 30 days</span><b>{att?.length ? pct(present / att.length) : "–"}</b><span className="muted text-xs">{present} of {att?.length ?? 0} days</span></div>
        <Link href={`/accounts?family=${s.family_id}`} className="tile hover:border-[var(--blue-ring)]"><span className="muted">Family fee balance</span><b>{rupees(Number(bal?.balance_paisa ?? 0))}</b><span className="muted text-xs">open fee desk</span></Link>
        <div className="tile"><span className="muted">Brothers / sisters here</span><b>{siblings?.length ?? 0}</b><span className="muted text-xs">same family</span></div>
        <Link href={`/print/report-card/${id}`} className="tile hover:border-[var(--blue-ring)]"><span className="muted">Report card</span><b>Print</b><span className="muted text-xs">all exams this year</span></Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <form action={saveStudent} className="card">
          <h2 className="h2">Student</h2>
          <input type="hidden" name="student_id" value={id} />
          <label className="field">Full name<input className="input" name="full_name" required defaultValue={s.full_name} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Class
              <select className="input" name="section_id" defaultValue={s.section_id ?? ""}>
                <option value="">No class</option>
                {secs.map((x) => <option key={x.id} value={x.id}>{x.classes.name}-{x.name}</option>)}
              </select>
            </label>
            <label className="field">Roll no<input className="input" name="roll_no" defaultValue={s.roll_no ?? ""} /></label>
            <label className="field">Admission no<input className="input" name="admission_no" defaultValue={s.admission_no ?? ""} /></label>
            <label className="field">B-form no<input className="input" name="b_form" defaultValue={s.b_form ?? ""} placeholder="12345-1234567-1" /></label>
            <label className="field">Gender
              <select className="input" name="gender" defaultValue={s.gender ?? ""}><option value="">Not set</option><option value="male">Boy</option><option value="female">Girl</option></select>
            </label>
            <label className="field">Date of birth<input className="input" type="date" name="date_of_birth" defaultValue={s.date_of_birth ?? ""} /></label>
          </div>
          <label className="field">Status
            <select className="input" name="status" defaultValue={s.status}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <p className="muted">A student who left or was struck off drops out of attendance, marks and class lists, but the fee record stays.</p>
          <button className="btn self-start" type="submit">Save student</button>
        </form>

        <div className="flex flex-col gap-5">
          <form action={saveFamily} className="card">
            <h2 className="h2">Family</h2>
            <input type="hidden" name="student_id" value={id} /><input type="hidden" name="family_id" value={fam.id} />
            <label className="field">Family name<input className="input" name="name" required defaultValue={fam.name} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">Parent&apos;s mobile<input className="input" name="phone" inputMode="tel" defaultValue={fam.phone ?? ""} /></label>
              <label className="field">Reminder number<input className="input" name="reminder_phone" inputMode="tel" defaultValue={fam.reminder_phone ?? ""} /></label>
            </div>
            <label className="field">Send reminders by
              <select className="input" name="reminder_channel" defaultValue={fam.reminder_channel}>{Object.entries(CHOICE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="field">Address<input className="input" name="address" defaultValue={fam.address ?? ""} /></label>
            {(siblings ?? []).length > 0 && (
              <p className="text-sm font-bold">Also here: {((siblings ?? []) as unknown as { id: string; full_name: string; sections: { name: string; classes: { name: string } } | null }[]).map((b, i) => (
                <span key={b.id}>{i ? ", " : ""}<Link href={`/principal/students/${b.id}`} className="underline">{b.full_name}</Link>{b.sections ? ` (${b.sections.classes.name}-${b.sections.name})` : ""}</span>
              ))}</p>
            )}
            <button className="btn self-start" type="submit">Save family</button>
          </form>
          <section className="card">
            <h2 className="h2">Results</h2>
            {byExam.size === 0 && <p className="muted">No marks yet.</p>}
            {[...byExam.values()].sort((a, b) => a.date.localeCompare(b.date)).map((e) => (
              <div key={e.name} className="flex justify-between font-extrabold tabular-nums"><span>{e.name}</span><span>{e.got} / {e.out} · {e.out ? pct(e.got / e.out) : ""}</span></div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
