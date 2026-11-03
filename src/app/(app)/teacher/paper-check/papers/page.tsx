import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { PaperTabs } from "@/components/paper-tabs";
import { PRESETS, totalMarks, type Pattern } from "@/lib/question-paper";
import { makeQuestionPaper } from "../bank-actions";

type Search = { class?: string; subject?: string; preset?: string; error?: string };

// Make a board-style paper from the question bank, and the papers made so far.
export default async function Papers({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: classes }, { data: subjects }, { data: papers }] = await Promise.all([
    supabase.from("classes").select("id, name").order("sort"),
    supabase.from("subjects").select("id, name").order("name"),
    supabase.from("question_papers").select("id, title, pattern, created_at, classes(name), subjects(name), profiles(full_name)").order("created_at", { ascending: false }).limit(50),
  ]);
  const cls = (classes ?? []).find((c) => c.id === sp.class) ?? (classes ?? []).find((c) => c.name === "Class 9") ?? (classes ?? [])[0];
  const subject = (subjects ?? []).find((s) => s.id === sp.subject) ?? (subjects ?? [])[0];
  const { data: rows } = cls && subject
    ? await supabase.from("question_bank").select("chapter, kind, source").eq("class_id", cls.id).eq("subject_id", subject.id).limit(5000)
    : { data: [] };
  const bank = (rows ?? []) as { chapter: string; kind: string; source: string }[];
  const chapters = [...new Set(bank.map((q) => q.chapter))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const count = (ch: string, k: string) => bank.filter((q) => q.chapter === ch && q.kind === k).length;
  const preset = PRESETS.find((p) => p.id === sp.preset) ?? PRESETS[0];
  const p = preset.pattern;
  const base = `/teacher/paper-check/papers?class=${cls?.id}&subject=${subject?.id}`;
  type PaperRow = { id: string; title: string; pattern: Pattern; created_at: string; classes: { name: string } | null; subjects: { name: string } | null; profiles: { full_name: string } | null };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">Make a paper</h1>
          <p className="muted text-base">Board-style paper from your question bank: Section A MCQs, Section B short questions, Section C long questions.</p>
        </div>
        <PaperTabs current="papers" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      <form className="card flex flex-row flex-wrap items-end gap-2">
        <label className="field">Class<select className="input" name="class" defaultValue={cls?.id}>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field">Subject<select className="input" name="subject" defaultValue={subject?.id}>{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <input type="hidden" name="preset" value={preset.id} />
        <button className="btn-ghost" type="submit">Show</button>
      </form>
      {cls && subject && (
        chapters.length === 0 ? (
          <section className="card">
            <p className="muted">{cls.name} {subject.name} has no questions in the bank yet.</p>
            <Link className="btn self-start" href={`/teacher/paper-check/bank?class=${cls.id}&subject=${subject.id}`}>Open Question bank</Link>
          </section>
        ) : (
          <form action={makeQuestionPaper} className="card">
            <input type="hidden" name="class_id" value={cls.id} /><input type="hidden" name="subject_id" value={subject.id} />
            <h2 className="h2">1. Chapters</h2>
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
              {chapters.map((ch) => (
                <label key={ch} className="row-box cursor-pointer">
                  <input type="checkbox" name="chapter" value={ch} defaultChecked />
                  <span className="flex-1 font-extrabold" dir="auto">{ch}</span>
                  <span className="muted text-xs">{count(ch, "mcq")} MCQ · {count(ch, "short")} short · {count(ch, "long")} long</span>
                </label>
              ))}
            </div>
            <h2 className="h2">2. Pattern</h2>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((x) => (
                <Link key={x.id} href={`${base}&preset=${x.id}`} className={`pill ${x.id === preset.id ? "pill-blue" : "pill-gray"}`}>{x.label}</Link>
              ))}
            </div>
            <p className="muted text-sm">Board schemes change from time to time. Check the numbers against the latest BISE scheme and change any of them.</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3" key={preset.id}>
              <fieldset className="row-box flex-col items-stretch">
                <b>Section A: MCQs</b>
                <label className="field">How many<input className="input" type="number" name="mcq_count" min={0} max={60} defaultValue={p.mcq.count} /></label>
                <label className="field">Marks each<input className="input" type="number" name="mcq_marks" min={1} max={5} defaultValue={p.mcq.marks} /></label>
              </fieldset>
              <fieldset className="row-box flex-col items-stretch">
                <b>Section B: Short questions</b>
                <label className="field">Question groups (Q2, Q3...)<input className="input" type="number" name="short_groups" min={0} max={5} defaultValue={p.short.groups} /></label>
                <label className="field">Questions in each group<input className="input" type="number" name="short_per" min={0} max={15} defaultValue={p.short.perGroup} /></label>
                <label className="field">Attempt any<input className="input" type="number" name="short_attempt" min={0} max={15} defaultValue={p.short.attempt} /></label>
                <label className="field">Marks each<input className="input" type="number" name="short_marks" min={1} max={10} defaultValue={p.short.marks} /></label>
              </fieldset>
              <fieldset className="row-box flex-col items-stretch">
                <b>Section C: Long questions</b>
                <label className="field">Questions given<input className="input" type="number" name="long_count" min={0} max={10} defaultValue={p.long.count} /></label>
                <label className="field">Attempt any<input className="input" type="number" name="long_attempt" min={0} max={10} defaultValue={p.long.attempt} /></label>
                <label className="field">Marks each<input className="input" type="number" name="long_marks" min={1} max={20} defaultValue={p.long.marks} /></label>
              </fieldset>
            </div>
            <p className="font-extrabold">This pattern: {totalMarks(p)} marks. The paper shows the total for the numbers you set.</p>
            <h2 className="h2">3. Paper</h2>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <label className="field">Title<input className="input" name="title" defaultValue={`${subject.name} ${cls.name}`} required /></label>
              <label className="field">Time (minutes)<input className="input" type="number" name="minutes" min={10} max={240} defaultValue={p.minutes} /></label>
              <label className="field">Questions from<select className="input" name="mode"><option value="all">Whole bank</option><option value="exercise">Textbook exercise and past papers only</option></select></label>
            </div>
            <button className="btn self-start" type="submit">Make the paper</button>
          </form>
        )
      )}
      <section className="card">
        <h2 className="h2">Papers made</h2>
        {(papers ?? []).length === 0 && <p className="muted">No papers yet.</p>}
        {((papers ?? []) as unknown as PaperRow[]).map((x) => (
          <Link key={x.id} href={`/teacher/paper-check/papers/${x.id}`} className="row-box">
            <span className="flex-1 font-extrabold" dir="auto">{x.title}</span>
            <span className="muted text-sm">{x.classes?.name} · {x.subjects?.name} · {totalMarks(x.pattern)} marks · {x.profiles?.full_name ?? ""} · {x.created_at.slice(0, 10)}</span>
          </Link>
        ))}
      </section>
    </>
  );
}
