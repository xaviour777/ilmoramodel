import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { checkableSections } from "@/lib/paper-check/data";
import { MAX_WRITTEN } from "@/lib/paper-check/layout";
import { todayPK } from "@/lib/format";
import { createPaperTest } from "../actions";
import { AiQuizHelper } from "@/components/ai-quiz-helper";

type Search = { section?: string; error?: string };

export default async function NewPaperTestPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const sections = await checkableSections(me);
  const section = sections.find((s) => s.id === sp.section) ?? sections[0];
  const [{ data: subjectRows }, { data: exams }] = await Promise.all([
    section ? supabase.from("section_subjects").select("subject_id, teacher_id, subjects(name)").eq("section_id", section.id) : Promise.resolve({ data: [] }),
    supabase.from("exams").select("id, name, total_marks").in("status", ["date_sheet", "marks_entry"]).order("starts_on"),
  ]);
  const subjects = (subjectRows ?? []) as unknown as { subject_id: string; teacher_id: string | null; subjects: { name: string } }[];
  // A teacher's own subjects first.
  subjects.sort((a, b) => Number(b.teacher_id === me.id) - Number(a.teacher_id === me.id) || a.subjects.name.localeCompare(b.subjects.name));
  const pill = (on: boolean) => on
    ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)", color: "var(--blue-ink)" }
    : { borderColor: "var(--line)", background: "#fff" };

  return (
    <>
      <div>
        <Link href="/teacher/paper-check" className="muted text-sm underline">Paper checking</Link>
        <h1 className="h1">New test</h1>
        <p className="muted text-base">Let AI draft the questions, or type them yourself: the MCQ answer key and, for written questions, what earns marks. Each student gets a sheet with their own QR code.</p>
      </div>
      <section className="card">
        <div className="flex flex-wrap gap-2">{sections.map((s) => (
          <Link key={s.id} href={`/teacher/paper-check/new?section=${s.id}`} className="inline-flex min-h-10 items-center rounded-full border-2 px-3.5 text-sm font-extrabold" style={pill(s.id === section?.id)}>{s.label}</Link>
        ))}</div>
        {!section ? (
          <p className="muted">You don&apos;t have a class yet. Ask the principal to assign you one.</p>
        ) : subjects.length === 0 ? (
          <p className="muted">{section.label} has no subjects yet. Ask the principal to add subjects on the Classes page.</p>
        ) : (
          <>
          <AiQuizHelper formId="new-test" className={section.label} />
          <form id="new-test" action={createPaperTest} className="flex flex-col gap-3">
            <input type="hidden" name="section_id" value={section.id} />
            {sp.error && <div className="notice-bad">{sp.error}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field">Subject
                <select className="input" name="subject_id" required>
                  {subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.subjects.name}</option>)}
                </select>
              </label>
              <label className="field">Test name<input className="input" name="title" required placeholder="Chapter 3 weekly test" /></label>
              <label className="field">Date<input className="input" type="date" name="test_date" defaultValue={todayPK()} /></label>
              <label className="field">Add marks to exam (optional)
                <select className="input" name="exam_id" defaultValue="">
                  <option value="">Don&apos;t add to an exam</option>
                  {(exams ?? []).map((e) => <option key={e.id} value={e.id}>{e.name} (out of {e.total_marks})</option>)}
                </select>
              </label>
            </div>

            <h2 className="h2">MCQs</h2>
            <label className="field">Answer key, one letter per question
              <input className="input font-mono uppercase tracking-widest" name="mcq_key" placeholder="ACBDA BCDAB" autoComplete="off" />
            </label>
            <label className="field">MCQ questions (optional, to print the question paper): the question on one line, then one line per option
              <textarea className="input min-h-40 font-mono text-sm" name="mcq_questions" placeholder={"1. What is the SI unit of force?\nA) Joule\nB) Newton\nC) Watt\nD) Pascal"} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">Options per MCQ
                <select className="input" name="options_per_mcq" defaultValue="4">
                  <option value="3">3 (A-C)</option><option value="4">4 (A-D)</option><option value="5">5 (A-E)</option>
                </select>
              </label>
              <label className="field">Marks per MCQ<input className="input" type="number" name="mcq_marks_each" step="0.5" min={0.5} defaultValue={1} /></label>
            </div>

            <h2 className="h2">Written questions <span className="muted">(up to {MAX_WRITTEN}, leave empty if none)</span></h2>
            <p className="muted text-sm">Marking points: write each point and its marks, for example <b>Definition 2, Example 1</b>. They must add up to the question&apos;s marks.</p>
            {Array.from({ length: MAX_WRITTEN }, (_, i) => i + 1).map((n) => (
              <div key={n} className="grid gap-2 rounded-2xl border-2 p-3 sm:grid-cols-[1fr_90px]" style={{ borderColor: "var(--line)" }}>
                <label className="field">Q{n}<input className="input" name={`q${n}_prompt`} placeholder={n === 1 ? "Define photosynthesis and give one example." : ""} /></label>
                <label className="field">Marks<input className="input" type="number" name={`q${n}_marks`} step="0.5" min={0} placeholder="3" /></label>
                <label className="field">Marking points<input className="input" name={`q${n}_rubric`} placeholder={n === 1 ? "Definition 2, Example 1" : ""} /></label>
                <label className="field">Topic<input className="input" name={`q${n}_topic`} placeholder={n === 1 ? "Ch 3" : ""} /></label>
              </div>
            ))}
            <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="auto_publish" className="h-5 w-5" defaultChecked /> Quick quiz: show the result to students and parents as soon as I finish checking (not for tests that add marks to an exam)</label>
            <button className="btn self-end" type="submit">Create test</button>
          </form>
          </>
        )}
      </section>
    </>
  );
}
