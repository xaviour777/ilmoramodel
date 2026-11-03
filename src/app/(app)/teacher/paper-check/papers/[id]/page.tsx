import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { checkableSections } from "@/lib/paper-check/data";
import { PaperTabs } from "@/components/paper-tabs";
import { totalMarks, type PaperItem, type Pattern } from "@/lib/question-paper";
import { deletePaper, mcqTestFromPaper, replaceItem } from "../../bank-actions";

const SECTION: Record<string, string> = { A: "Section A: MCQs", B: "Section B: Short questions", C: "Section C: Long questions" };

// One made paper: check it, swap any question, print it with or without the answer key.
export default async function PaperDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: paper } = await supabase.from("question_papers")
    .select("id, title, class_id, chapters, pattern, items, minutes, created_by, classes(name), subjects(name)").eq("id", id).maybeSingle();
  if (!paper) notFound();
  const items = paper.items as PaperItem[];
  const pattern = paper.pattern as Pattern;
  const cls = paper.classes as unknown as { name: string } | null;
  const subject = paper.subjects as unknown as { name: string } | null;
  const [mine, { data: classSections }] = await Promise.all([
    checkableSections(me),
    supabase.from("sections").select("id").eq("class_id", paper.class_id),
  ]);
  const inClass = new Set((classSections ?? []).map((s) => s.id));
  const sections = mine.filter((s) => inClass.has(s.id));
  const canEdit = paper.created_by === me.id || me.role !== "teacher";
  const mcqCount = items.filter((i) => i.section === "A").length;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1" dir="auto">{paper.title}</h1>
          <p className="muted text-base">{cls?.name} · {subject?.name} · {totalMarks(pattern)} marks · {paper.minutes} minutes · Chapters: {(paper.chapters as string[]).join(", ")}</p>
        </div>
        <PaperTabs current="papers" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      <section className="card flex flex-row flex-wrap items-center gap-2">
        <Link className="btn" href={`/print/question-paper/${paper.id}`} target="_blank">Print paper</Link>
        <Link className="btn-ghost" href={`/print/question-paper/${paper.id}?key=1`} target="_blank">Print answer key</Link>
        <Link className="btn-ghost" href="/teacher/paper-check/papers">All papers</Link>
      </section>
      {(["A", "B", "C"] as const).map((sec) => {
        const list = items.map((it, at) => ({ it, at })).filter(({ it }) => it.section === sec);
        if (!list.length) return null;
        return (
          <section key={sec} className="card">
            <h2 className="h2">{SECTION[sec]}</h2>
            {list.map(({ it, at }, n) => (
              <div key={at} id={`q-${at}`} className="row-box items-start">
                <span className="pill pill-gray">{sec === "C" ? `Q${it.qno}` : sec === "B" ? `Q${it.qno} (${n + 1})` : n + 1}</span>
                <div className="flex-1" dir="auto">
                  <div className="font-extrabold">{it.question}</div>
                  {it.kind === "mcq" && <div className="text-sm font-bold">{it.options.map((o, k) => <span key={k} className="mr-3">({"ABCDE"[k]}) {o}</span>)} · <b>{it.answer}</b></div>}
                  <div className="muted text-xs">{it.chapter} · {it.marks} marks</div>
                </div>
                {canEdit && (
                  <form action={replaceItem}>
                    <input type="hidden" name="paper_id" value={paper.id} /><input type="hidden" name="at" value={at} />
                    <button className="btn-ghost" type="submit">Replace</button>
                  </form>
                )}
              </div>
            ))}
          </section>
        );
      })}
      {mcqCount > 0 && (
        <form action={mcqTestFromPaper} className="card">
          <h2 className="h2">Check Section A by scanning</h2>
          <p className="muted">Makes a test in Paper checking with these {mcqCount} MCQs and their answers. Print the bubble sheets there, then scan them with a phone.</p>
          <input type="hidden" name="paper_id" value={paper.id} />
          {sections.length === 0 ? <p className="muted">You don&apos;t teach any section of {cls?.name}.</p> : (
            <div className="flex flex-row flex-wrap items-end gap-2">
              <label className="field">Section<select className="input" name="section_id">{sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
              <button className="btn" type="submit">Make scan test</button>
            </div>
          )}
        </form>
      )}
      {canEdit && (
        <form action={deletePaper} className="self-start">
          <input type="hidden" name="paper_id" value={paper.id} />
          <button className="btn-ghost" type="submit">Delete this paper</button>
        </form>
      )}
    </>
  );
}
