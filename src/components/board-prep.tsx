import { createClient } from "@/lib/supabase/server";
import { pct } from "@/lib/format";
import { PracticeTest } from "./practice-test";

type Kid = { id: string; full_name: string; sections: { name: string; classes: { name: string } } | null };
type Topic = { subject_id: string; subject: string; chapter: string; questions: number };

// Board exam readiness: for each subject, how many chapters have been practised and how well,
// plus a timed full-syllabus mock from the question bank (past papers included).
export async function BoardPrep({ kid }: { kid: Kid }) {
  const sb = await createClient();
  const [{ data: topics }, { data: tries }] = await Promise.all([
    sb.rpc("practice_topics", { p_student: kid.id }),
    sb.from("practice_attempts").select("subject_id, chapter, total, correct").eq("student_id", kid.id).limit(2000),
  ]);
  const T = (topics ?? []) as Topic[];
  const subjects = [...new Map(T.map((t) => [t.subject_id, t.subject])).entries()];
  const rows = subjects.map(([id, name]) => {
    const chapters = T.filter((t) => t.subject_id === id);
    const per = chapters.map((c) => {
      const a = (tries ?? []).filter((x) => x.subject_id === id && x.chapter === c.chapter);
      const tot = a.reduce((s, x) => s + x.total, 0);
      return { ch: c.chapter, acc: tot ? a.reduce((s, x) => s + x.correct, 0) / tot : null };
    });
    const mocks = (tries ?? []).filter((x) => x.subject_id === id && !x.chapter);
    const mt = mocks.reduce((s, x) => s + x.total, 0);
    const done = per.filter((p) => p.acc != null);
    const cover = per.length ? done.length / per.length : 0;
    const acc = done.length ? done.reduce((s, p) => s + p.acc!, 0) / done.length : 0;
    return { id, name, per, cover, acc, ready: cover * acc, mock: mt ? mocks.reduce((s, x) => s + x.correct, 0) / mt : null, n: chapters.reduce((s, c) => s + c.questions, 0) };
  });
  const first = kid.full_name.split(" ")[0];
  if (!rows.length) return <section className="card"><h2 className="h2">Board exam prep · {first}</h2><p className="muted">No questions in the bank for this class yet. When teachers add MCQs (or past-paper questions), chapter readiness and mock tests appear here.</p></section>;
  const color = (v: number | null) => (v == null ? "var(--line)" : v >= 0.7 ? "var(--green)" : v >= 0.5 ? "var(--orange)" : "var(--red)");
  return (
    <>
      <section className="card">
        <h2 className="h2">Board readiness · {first}</h2>
        <p className="muted text-sm">Ready = chapters practised × marks in them. Aim for 70%+ in every subject before the board.</p>
        {rows.map((r) => (
          <div key={r.id} className="flex flex-col gap-1.5 border-t-2 pt-2" style={{ borderColor: "var(--line)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2 font-black"><span>{r.name}</span>
              <span className="text-sm">{pct(r.ready)} ready · {Math.round(r.cover * r.per.length)}/{r.per.length} chapters{r.mock != null ? ` · mock ${pct(r.mock)}` : ""}</span></div>
            <div className="track"><i style={{ width: `${Math.round(r.ready * 100)}%`, background: color(r.ready) }} /></div>
            <div className="flex flex-wrap gap-1">{r.per.map((p) => <span key={p.ch} title={p.acc == null ? "not practised" : pct(p.acc)} className="rounded-md px-2 py-0.5 text-[11px] font-black" style={{ background: color(p.acc), color: p.acc == null ? "var(--muted)" : "#fff" }}>{p.ch}</span>)}</div>
          </div>
        ))}
        <p className="muted text-xs">Grey = not practised yet, red = below 50%, orange = 50–69%, green = 70%+.</p>
      </section>
      <section className="card">
        <h2 className="h2">Full mock test</h2>
        <p className="muted text-sm">25 questions from the whole syllabus, 30 minutes, like the board&apos;s objective part.</p>
        <PracticeTest studentId={kid.id} n={25} minutes={30} topics={rows.map((r) => ({ subject_id: r.id, subject: r.name, chapter: "", questions: r.n }))} />
      </section>
    </>
  );
}
