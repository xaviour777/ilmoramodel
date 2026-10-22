import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { mySections } from "@/lib/teacher";
import { saveMarks } from "../actions";

type Search = { exam?: string; subject?: string; section?: string; saved?: string; error?: string };

export default async function MarksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const sections = await mySections(me.id);
  const [{ data: exams }, { data: subjectRows }] = await Promise.all([
    supabase.from("exams").select("id, name, total_marks, status").in("status", ["marks_entry", "date_sheet"]).order("starts_on"),
    supabase.from("section_subjects").select("section_id, subject_id, subjects(name)").eq("teacher_id", me.id),
  ]);
  const exam = (exams ?? []).find((e) => e.id === sp.exam) ?? (exams ?? [])[0];
  const section = sections.find((s) => s.id === sp.section) ?? sections[0];
  const subs = ((subjectRows ?? []) as unknown as { section_id: string; subject_id: string; subjects: { name: string } }[])
    .filter((r) => r.section_id === section?.id);
  const subject = subs.find((s) => s.subject_id === sp.subject) ?? subs[0];

  const [{ data: students }, { data: marks }] = await Promise.all([
    section ? supabase.from("students").select("id, full_name, roll_no").eq("section_id", section.id).eq("status", "enrolled").order("roll_no") : Promise.resolve({ data: [] }),
    exam && subject ? supabase.from("marks").select("student_id, obtained, is_absent, locked").eq("exam_id", exam.id).eq("subject_id", subject.subject_id) : Promise.resolve({ data: [] }),
  ]);
  const m = new Map((marks ?? []).map((r: { student_id: string; obtained: number | null; is_absent: boolean; locked: boolean }) => [r.student_id, r]));
  const link = (o: Partial<Search>) => `/teacher/marks?exam=${o.exam ?? exam?.id ?? ""}&section=${o.section ?? section?.id ?? ""}&subject=${o.subject ?? subject?.subject_id ?? ""}`;
  const pillStyle = (on: boolean) => on
    ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)", color: "var(--blue-ink)" }
    : { borderColor: "var(--line)", background: "#fff" };

  return (
    <>
      <div>
        <h1 className="h1">Marks entry</h1>
        <p className="muted text-base">Type marks for each student, or A for absent. Saved marks stay editable until the principal locks them.</p>
      </div>
      <section className="card">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">{(exams ?? []).map((e) => (
            <Link key={e.id} href={link({ exam: e.id })} className="inline-flex min-h-10 items-center rounded-full border-2 px-3.5 text-sm font-extrabold" style={pillStyle(e.id === exam?.id)}>{e.name}</Link>
          ))}</div>
          <div className="flex flex-wrap gap-2">{sections.map((s) => (
            <Link key={s.id} href={link({ section: s.id, subject: "" })} className="inline-flex min-h-10 items-center rounded-full border-2 px-3.5 text-sm font-extrabold" style={pillStyle(s.id === section?.id)}>{s.label}</Link>
          ))}</div>
          <div className="flex flex-wrap gap-2">{subs.map((s) => (
            <Link key={s.subject_id} href={link({ subject: s.subject_id })} className="inline-flex min-h-10 items-center rounded-full border-2 px-3.5 text-sm font-extrabold" style={pillStyle(s.subject_id === subject?.subject_id)}>{s.subjects.name}</Link>
          ))}</div>
        </div>
        {!exam || !subject ? (
          <p className="muted">No exam is open for marks, or you don&apos;t teach a subject in this section.</p>
        ) : (
          <form action={saveMarks} className="flex flex-col gap-2">
            <input type="hidden" name="exam_id" value={exam.id} />
            <input type="hidden" name="subject_id" value={subject.subject_id} />
            <input type="hidden" name="section_id" value={section!.id} />
            <h2 className="h2">{exam.name} · {subject.subjects.name} · {section!.label} <span className="muted">out of {exam.total_marks}</span></h2>
            {sp.saved && <div className="notice-ok">Marks saved.</div>}
            {sp.error && <div className="notice-bad">{sp.error}</div>}
            {(students ?? []).map((s: { id: string; full_name: string; roll_no: string }) => {
              const r = m.get(s.id);
              return (
                <div key={s.id} className="row-box">
                  <input type="hidden" name="student_id" value={s.id} />
                  <div className="min-w-0 flex-1"><div className="truncate font-extrabold">{s.full_name}</div><div className="muted text-xs">Roll {s.roll_no}</div></div>
                  {r?.locked && <span className="pill pill-gray">Locked</span>}
                  <input className="input w-24 text-center" name={`m_${s.id}`} inputMode="decimal" disabled={r?.locked}
                    defaultValue={r ? (r.is_absent ? "A" : r.obtained ?? "") : ""} aria-label={`Marks for ${s.full_name}`} />
                </div>
              );
            })}
            <button className="btn self-end" type="submit">Save marks</button>
          </form>
        )}
      </section>
    </>
  );
}
