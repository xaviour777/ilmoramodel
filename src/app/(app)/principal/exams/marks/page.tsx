import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { PageHead, Empty } from "@/components/ilm";
import { saveOfficeMarks } from "../actions";

type Search = { exam?: string; section?: string; subject?: string; saved?: string; error?: string };

// The office or principal types one section's marks for one subject: for schools where teachers
// hand in paper award lists, or a teacher is away. Tab and Enter move down the list.
export default async function OfficeMarks({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: exam } = await supabase.from("exams").select("id, name, term_id, total_marks, status, exam_sections(section_id, sections(id, name, class_id, classes(name, sort)))").eq("id", sp.exam ?? "").maybeSingle();
  if (!exam) return <Empty>Choose an exam on the Exams page first.</Empty>;
  type Sec = { id: string; name: string; class_id: string; classes: { name: string; sort: number } };
  const secs = ((exam.exam_sections ?? []) as unknown as { sections: Sec }[]).map((x) => x.sections)
    .sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const section = secs.find((s) => s.id === sp.section) ?? secs[0];
  const [{ data: ss }, { data: papers }] = await Promise.all([
    supabase.from("section_subjects").select("subject_id, subjects(name), profiles(full_name)").eq("section_id", section?.id ?? ""),
    supabase.from("exam_papers").select("subject_id, subjects(name)").eq("exam_id", exam.id).eq("class_id", section?.class_id ?? ""),
  ]);
  const subjects = [...new Map([
    ...((ss ?? []) as unknown as { subject_id: string; subjects: { name: string }; profiles: { full_name: string } | null }[]).map((x) => [x.subject_id, { name: x.subjects.name, teacher: x.profiles?.full_name ?? null }] as const),
    ...((papers ?? []) as unknown as { subject_id: string; subjects: { name: string } }[]).map((x) => [x.subject_id, { name: x.subjects.name, teacher: null }] as const),
  ].reverse()).entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  const subject = subjects.find(([id]) => id === sp.subject) ?? subjects[0];
  const [{ data: students }, { data: marks }] = await Promise.all([
    supabase.from("students").select("id, full_name, roll_no").eq("section_id", section?.id ?? "").eq("status", "enrolled").order("roll_no").order("full_name"),
    supabase.from("marks").select("student_id, obtained, is_absent, locked").eq("exam_id", exam.id).eq("subject_id", subject?.[0] ?? ""),
  ]);
  const m = new Map((marks ?? []).map((r) => [r.student_id, r]));
  const link = (o: Partial<Search>) => `/principal/exams/marks?exam=${exam.id}&section=${o.section ?? section?.id}&subject=${o.subject ?? subject?.[0] ?? ""}`;
  // after saving, go to the next subject of this section that still has blanks
  const at = subjects.findIndex(([id]) => id === subject?.[0]);
  const nextSubject = subjects[at + 1];
  const filled = (students ?? []).filter((s) => m.has(s.id)).length;
  const locked = exam.status === "results";
  const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-xl border-2 px-3 text-[13px] font-extrabold ${on ? "border-[#7dd3fc] bg-[#e0f2fe] text-[#0369a1]" : "border-[#e5e7eb] bg-white"}`;

  return (
    <>
      <PageHead kick={`Exams · ${exam.name}`} title="Type marks" sub={`Out of ${exam.total_marks}. Type A for absent. Leave a box empty to skip it.`}>
        <Link href={`/principal/exams?term=${exam.term_id}&exam=${exam.id}&step=marks`} className="btn-ghost">Back to the exam</Link>
      </PageHead>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      <section className="card flex flex-col gap-2">
        <div className="kick">Section</div>
        <div className="flex flex-wrap gap-1.5">{secs.map((s) => <Link key={s.id} href={link({ section: s.id, subject: "" })} className={chip(s.id === section?.id)}>{s.classes.name.replace("Class ", "")}-{s.name}</Link>)}</div>
        <div className="kick mt-1">Subject</div>
        <div className="flex flex-wrap gap-1.5">{subjects.map(([id, s]) => <Link key={id} href={link({ subject: id })} className={chip(id === subject?.[0])}>{s.name}</Link>)}</div>
        {subjects.length === 0 && <p className="muted">No subjects for this section. Make the date sheet or set subject teachers on Classes.</p>}
      </section>
      {section && subject && (
        <form action={saveOfficeMarks} className="card flex flex-col gap-2">
          <input type="hidden" name="exam_id" value={exam.id} /><input type="hidden" name="section_id" value={section.id} /><input type="hidden" name="subject_id" value={subject[0]} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">{section.classes.name}-{section.name} · {subject[1].name}</h2>
            <span className="muted text-[13px]">{subject[1].teacher ? `Teacher: ${subject[1].teacher} · ` : ""}{filled} of {(students ?? []).length} filled</span>
          </div>
          {locked && <p className="notice-bad">Results are published, so these marks are locked.</p>}
          <div className="grid gap-x-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {(students ?? []).map((s, i) => {
              const r = m.get(s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 border-t-2 border-[#f1f5f9] py-1.5">
                  <span className="w-8 text-right text-[12px] font-black text-[#94a3b8] tabular-nums">{s.roll_no ?? i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{s.full_name}</span>
                  <input type="hidden" name="student_id" value={s.id} />
                  <input className="input !min-h-10 w-20 text-center font-black" name={`m_${s.id}`} inputMode="decimal" autoComplete="off" disabled={locked || r?.locked}
                    defaultValue={r ? (r.is_absent ? "A" : String(r.obtained ?? "")) : ""} aria-label={`${s.full_name} marks`} />
                </label>
              );
            })}
          </div>
          {(students ?? []).length === 0 && <Empty>No students in this section.</Empty>}
          {!locked && (students ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button className="btn" type="submit">Save</button>
              {nextSubject && <button className="btn-ghost" type="submit" name="next" value={link({ subject: nextSubject[0] })}>Save, next: {nextSubject[1].name}</button>}
            </div>
          )}
        </form>
      )}
    </>
  );
}
