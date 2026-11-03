import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { PaperTabs } from "@/components/paper-tabs";
import { AiBankHelper } from "@/components/ai-bank-helper";
import { addQuestion, deleteQuestion } from "../bank-actions";

type Search = { class?: string; subject?: string; chapter?: string; kind?: string; saved?: string; error?: string };
const KIND: Record<string, string> = { mcq: "MCQ", short: "Short", long: "Long" };
const SOURCE: Record<string, string> = { exercise: "Textbook exercise", additional: "Additional", past_paper: "Past paper", teacher: "Teacher", ai: "AI, checked" };

// The school's own question bank, chapter by chapter, for one class and subject.
export default async function QuestionBank({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: classes }, { data: subjects }] = await Promise.all([
    supabase.from("classes").select("id, name").order("sort"),
    supabase.from("subjects").select("id, name").order("name"),
  ]);
  const cls = (classes ?? []).find((c) => c.id === sp.class) ?? (classes ?? []).find((c) => c.name === "Class 9") ?? (classes ?? [])[0];
  const subject = (subjects ?? []).find((s) => s.id === sp.subject) ?? (subjects ?? [])[0];
  const { data: rows } = cls && subject
    ? await supabase.from("question_bank").select("id, chapter, kind, question, options, answer, source").eq("class_id", cls.id).eq("subject_id", subject.id).order("created_at").limit(3000)
    : { data: [] };
  type Q = { id: string; chapter: string; kind: string; question: string; options: string[]; answer: string | null; source: string };
  const all = (rows ?? []) as Q[];
  const chapters = [...new Set(all.map((q) => q.chapter))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const chapter = sp.chapter && chapters.includes(sp.chapter) ? sp.chapter : chapters[0] ?? "";
  const count = (ch: string, k: string) => all.filter((q) => q.chapter === ch && q.kind === k).length;
  const shown = all.filter((q) => q.chapter === chapter && (!sp.kind || q.kind === sp.kind));
  const base = `/teacher/paper-check/bank?class=${cls?.id}&subject=${subject?.id}`;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">Question bank</h1>
          <p className="muted text-base">Your school&apos;s own questions, chapter by chapter. Papers in Make a paper are picked from here.</p>
        </div>
        <PaperTabs current="bank" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      <form className="card flex flex-row flex-wrap items-end gap-2">
        <label className="field">Class<select className="input" name="class" defaultValue={cls?.id}>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field">Subject<select className="input" name="subject" defaultValue={subject?.id}>{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <button className="btn-ghost" type="submit">Show</button>
        <span className="muted">{all.length} questions in {cls?.name} {subject?.name}</span>
      </form>
      {cls && subject && (
        <>
          <section className="card">
            <h2 className="h2">Chapters</h2>
            {chapters.length === 0 && <p className="muted">No questions yet. Make some with AI below, or add them one by one.</p>}
            <div className="flex flex-wrap gap-2">
              {chapters.map((ch) => (
                <Link key={ch} href={`${base}&chapter=${encodeURIComponent(ch)}`} className={`pill ${ch === chapter ? "pill-blue" : "pill-gray"}`}>
                  {ch} · {count(ch, "mcq")} MCQ · {count(ch, "short")} short · {count(ch, "long")} long
                </Link>
              ))}
            </div>
          </section>
          <AiBankHelper classId={cls.id} subjectId={subject.id} className={cls.name} subject={subject.name} chapter={chapter} />
          {chapter && (
            <section className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="h2">{chapter}</h2>
                <div className="flex gap-1.5">
                  {["", "mcq", "short", "long"].map((k) => (
                    <Link key={k} href={`${base}&chapter=${encodeURIComponent(chapter)}${k ? `&kind=${k}` : ""}`} className={`pill ${(sp.kind ?? "") === k ? "pill-blue" : "pill-gray"}`}>{k ? KIND[k] : "All"}</Link>
                  ))}
                </div>
              </div>
              {shown.map((q, i) => (
                <div key={q.id} className="row-box items-start">
                  <span className="pill pill-gray">{KIND[q.kind]}</span>
                  <div className="flex-1" dir="auto">
                    <div className="font-extrabold">{i + 1}. {q.question}</div>
                    {q.kind === "mcq" && <div className="text-sm font-bold">{q.options.map((o, k) => <span key={k} className="mr-3">({"ABCDE"[k]}) {o}</span>)} · <b>{q.answer}</b></div>}
                    {q.kind !== "mcq" && q.answer && <div className="muted text-sm">{q.answer}</div>}
                    <div className="muted text-xs">{SOURCE[q.source] ?? q.source}</div>
                  </div>
                  <form action={deleteQuestion}>
                    <input type="hidden" name="id" value={q.id} /><input type="hidden" name="class_id" value={cls.id} />
                    <input type="hidden" name="subject_id" value={subject.id} /><input type="hidden" name="chapter" value={chapter} />
                    <button className="btn-ghost" type="submit" aria-label="Delete question">Delete</button>
                  </form>
                </div>
              ))}
            </section>
          )}
          <form action={addQuestion} className="card">
            <h2 className="h2">Add a question yourself</h2>
            <input type="hidden" name="class_id" value={cls.id} /><input type="hidden" name="subject_id" value={subject.id} />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <label className="field">Chapter<input className="input" name="chapter" required defaultValue={chapter} placeholder="e.g. 2. Kinematics" /></label>
              <label className="field">Type<select className="input" name="kind"><option value="mcq">MCQ</option><option value="short">Short question</option><option value="long">Long question</option></select></label>
              <label className="field">From<select className="input" name="source"><option value="exercise">Textbook exercise</option><option value="additional">Additional</option><option value="past_paper">Past board paper</option><option value="teacher">Teacher&apos;s own</option></select></label>
            </div>
            <label className="field">Question<textarea className="input" name="question" rows={2} required dir="auto" /></label>
            <label className="field">Options (MCQ only, one per line)<textarea className="input" name="options" rows={4} dir="auto" placeholder={"m/s\nm/s²\nN\nJ"} /></label>
            <label className="field">Answer (MCQ: the letter, like B. Short or long: model answer)<textarea className="input" name="answer" rows={2} dir="auto" /></label>
            <button className="btn self-start" type="submit">Add to bank</button>
          </form>
        </>
      )}
    </>
  );
}
