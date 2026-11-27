import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { aiStatus } from "@/lib/ai";
import { pct, shortDate, todayPK } from "@/lib/format";
import { LessonTabs } from "@/components/lesson-tabs";
import { Bar, Empty, Insight, Stat, Stats } from "@/components/ilm";
import { contentsText, plannedBy, progressOf, statusOf, STATUS, type Chapter } from "@/lib/syllabus";
import { SyllabusSetup } from "./setup";
import { deleteSyllabus, markLessons, moveFinish, replanFromToday, saveChapters } from "./actions";

type Search = { cls?: string; subj?: string; saved?: string; error?: string; all?: string };
type Lesson = { id: string; sort: number; chapter_n: number; chapter: string; topic: string; pages: string | null; homework: string | null; is_test: boolean; planned_on: string; done_on: string | null };
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const SAVED: Record<string, string> = { planned: "The whole-year plan is ready. Check the chapters below.", chapters: "Chapters saved and the plan re-made. Done lessons stay done.", replanned: "What is left is spread again from today to the finish date.", done: "Marked done.", undone: "Marked not done.", deleted: "Plan deleted." };

// Whole-year syllabus: the book becomes one lesson per period up to the finish date.
export default async function SyllabusPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const admin = me.role !== "teacher";
  let pairQ = supabase.from("section_subjects").select("subject_id, teacher_id, subjects(name), sections!inner(class_id, classes(name, sort))");
  if (!admin) pairQ = pairQ.eq("teacher_id", me.id);
  const [{ data: subs }, { data: books }, { data: sessions }, ai] = await Promise.all([
    pairQ,
    supabase.from("syllabus_books").select("id, class_id, subject_id, title, starts_on, finish_by"),
    supabase.from("academic_sessions").select("id, starts_on, ends_on, is_current").order("starts_on", { ascending: false }),
    aiStatus(supabase),
  ]);
  type S = { subject_id: string; subjects: { name: string }; sections: { class_id: string; classes: { name: string; sort: number } } };
  const pairs = [...new Map(((subs ?? []) as unknown as S[]).map((s) => [`${s.sections.class_id}|${s.subject_id}`, {
    cls: s.sections.class_id, subj: s.subject_id, className: s.sections.classes.name, subject: s.subjects.name, sort: s.sections.classes.sort,
  }])).values()].sort((a, b) => a.sort - b.sort || a.subject.localeCompare(b.subject));
  const bookOf = (c: string, s: string) => (books ?? []).find((b) => b.class_id === c && b.subject_id === s);
  const pick = pairs.find((p) => p.cls === sp.cls && p.subj === sp.subj) ?? (sp.cls ? pairs.find((p) => p.cls === sp.cls) : undefined) ?? pairs.find((p) => bookOf(p.cls, p.subj)) ?? pairs[0];
  const href = (c: string, s: string) => `/teacher/plans/syllabus?cls=${c}&subj=${s}`;

  // progress of every book in the list, for the chips
  const { data: all } = await supabase.from("syllabus_progress").select("book_id, total, done, should");
  const prog = new Map((all ?? []).map((r) => [r.book_id as string, { doneR: r.done / (r.total || 1), status: statusOf(r.done, r.should) }]));

  const book = pick ? (await supabase.from("syllabus_books").select("*").eq("class_id", pick.cls).eq("subject_id", pick.subj).maybeSingle()).data : null;
  const { data: ls } = book ? await supabase.from("syllabus_lessons").select("id, sort, chapter_n, chapter, topic, pages, homework, is_test, planned_on, done_on").eq("book_id", book.id).order("sort") : { data: [] };
  const lessons = (ls ?? []) as Lesson[];
  // the school year that holds today (the one marked current only when none does)
  const session = (sessions ?? []).find((x) => x.starts_on <= today && x.ends_on >= today) ?? (sessions ?? []).find((x) => x.is_current);
  const { data: exams } = session ? await supabase.from("exams").select("name, starts_on, terms!inner(session_id)").eq("terms.session_id", session.id).gt("starts_on", today).order("starts_on").limit(1) : { data: [] };

  const starts = session?.starts_on && session.starts_on > addDays(today, -200) ? session.starts_on : today;
  const finish = session?.ends_on ? addDays(session.ends_on, -45) : addDays(today, 240);
  return (
    <>
      <div><h1 className="h1">Lesson plans</h1><p className="muted text-base">The whole book planned to the last period, with targets for 3 months, the next exam and the finish.</p></div>
      <LessonTabs current="syllabus" />
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">{SAVED[sp.saved] ?? "Saved."}</div>}
      {pairs.length === 0 && <Empty>No subjects are assigned to you yet. The principal assigns them in Classes → Subjects.</Empty>}
      {pairs.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Class and subject">
          {pairs.slice(0, admin && !sp.all ? 40 : 400).map((p) => {
            const b = bookOf(p.cls, p.subj);
            const st = b ? prog.get(b.id) : undefined;
            const on = p === pick;
            return (
              <Link key={p.cls + p.subj} href={href(p.cls, p.subj)} scroll={false}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border-2 px-3 text-[13px] font-extrabold ${on ? "border-[#7dd3fc] bg-[#e0f2fe] text-[#0369a1]" : "border-[#e5e7eb] bg-white text-[#4b5563]"}`}>
                {p.className} · {p.subject}
                {st ? <span className={`tagx ${STATUS[st.status][1]}`}>{pct(st.doneR)}</span> : <span className="tagx">no plan</span>}
              </Link>
            );
          })}
          {admin && !sp.all && pairs.length > 40 && <Link className="btn-ghost min-h-10 px-3 text-sm" href="/teacher/plans/syllabus?all=1">All {pairs.length}</Link>}
        </div>
      )}
      {pick && !book && (
        <SyllabusSetup classId={pick.cls} subjectId={pick.subj} title={`${pick.subject} · ${pick.className}`} starts={starts} finish={finish} ppw={6} aiReady={!!ai?.ready} />
      )}
      {pick && book && <Plan book={book} lessons={lessons} today={today} nextExam={exams?.[0] as { name: string; starts_on: string } | undefined} cls={pick.cls} subj={pick.subj} name={`${pick.className} · ${pick.subject}`} />}
    </>
  );
}

function Plan({ book, lessons, today, nextExam, cls, subj, name }: { book: { id: string; title: string; starts_on: string; finish_by: string; chapters: Chapter[]; source: string }; lessons: Lesson[]; today: string; nextExam?: { name: string; starts_on: string }; cls: string; subj: string; name: string }) {
  const p = progressOf(lessons, today);
  const chapters = book.chapters ?? [];
  const reach = (d: string) => { const last = [...lessons].filter((l) => l.planned_on <= d).at(-1); return last ? `Ch ${last.chapter_n}` : "—"; };
  const targets = [
    { label: "In 3 months", d: addDays(book.starts_on, 91) },
    ...(nextExam && nextExam.starts_on < book.finish_by ? [{ label: nextExam.name, d: addDays(nextExam.starts_on, -1) }] : []),
    { label: "Finish", d: book.finish_by },
  ];
  const weekEnd = addDays(today, 6);
  const week = lessons.filter((l) => (l.planned_on >= addDays(today, -7) && l.planned_on <= weekEnd) || (!l.done_on && l.planned_on < today)).slice(0, 14);
  const lastPlanned = lessons.at(-1)?.planned_on;
  const hidden = (k: string, v: string | number) => <input type="hidden" name={k} value={v} />;
  const ids = <>{hidden("book_id", book.id)}{hidden("class_id", cls)}{hidden("subject_id", subj)}</>;
  const st = STATUS[p.status];
  return (
    <>
      <Stats min={150}>
        <Stat label="Done" value={pct(p.doneR)} sub={`${p.done} of ${p.total} lessons`} tone="#0284c7" />
        <Stat label="Should be done" value={pct(p.shouldR)} sub={`by today, ${shortDate(today)}`} />
        <Stat label="Status" value={st[0]} sub={p.behind ? `${p.behind} lessons behind` : "keep going"} warn={p.status !== "ok"} />
        <Stat label="Finish by" value={shortDate(book.finish_by)} sub={lastPlanned ? `last lesson ${shortDate(lastPlanned)}` : undefined} />
      </Stats>
      {p.status !== "ok" && <Insight>{name} is {p.behind} lessons behind the plan. Mark what you have taught with &quot;We are here&quot;, then tap Re-plan from today to spread what is left up to {shortDate(book.finish_by)}.</Insight>}

      <section className="card">
        <h2 className="h2">Targets</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {targets.map((t) => (
            <div key={t.label} className="rounded-xl p-3" style={{ background: "var(--page)" }}>
              <div className="kick">{t.label} · {shortDate(t.d)}</div>
              <div className="text-xl font-black">{pct(plannedBy(lessons, t.d))} of the book</div>
              <div className="muted text-sm">up to {reach(t.d)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card" id="week">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">This week</h2>
          <form action={replanFromToday}>{ids}<button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Re-plan from today</button></form></div>
        {week.length === 0 && <Empty>No lessons this week.</Empty>}
        {week.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-2 border-t-2 border-[#f1f5f9] py-2">
            <span className="w-24 text-sm font-black">{shortDate(l.planned_on)}</span>
            <span className="min-w-0 flex-1"><b>{l.is_test ? "📝 " : ""}{l.topic}</b>{l.pages ? <span className="muted text-sm"> · p {l.pages}</span> : null}{l.homework ? <span className="muted block text-sm">Homework: {l.homework}</span> : null}</span>
            {l.done_on ? <>
              <span className="tagx g">done {shortDate(l.done_on)}</span>
              <form action={markLessons}>{ids}{hidden("lesson_id", l.id)}{hidden("undo", "1")}<button className="btn-ghost min-h-9 px-2 text-xs" type="submit">Undo</button></form>
            </> : <>
              {!l.done_on && l.planned_on < today && <span className="tagx y">late</span>}
              <form action={markLessons}>{ids}{hidden("lesson_id", l.id)}<button className="btn min-h-9 px-3 text-sm" type="submit">Done</button></form>
              <form action={markLessons}>{ids}{hidden("sort", l.sort)}{hidden("upto", "1")}<button className="btn-ghost min-h-9 px-2 text-xs" type="submit" title="Mark this and every lesson before it done">We are here</button></form>
            </>}
            {l.is_test && <Link className="btn-ghost min-h-9 px-2 text-xs" href={`/teacher/paper-check/papers?class=${cls}&subject=${subj}&title=${encodeURIComponent(`${l.chapter} · Chapter ${l.chapter_n} test`)}`}>✨ Make the test paper</Link>}
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="h2">Chapters</h2>
        <div className="flex flex-col">
          {[...new Set(lessons.map((l) => l.chapter_n))].map((n) => {
            const mine = lessons.filter((l) => l.chapter_n === n);
            const done = mine.filter((l) => l.done_on).length;
            const r = done / mine.length;
            const late = !mine.at(-1)!.done_on && mine.at(-1)!.planned_on < today;
            return (
              <div key={n} className="border-t-2 border-[#f1f5f9] py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-extrabold">
                  <span>{n}. {mine[0].chapter}</span>
                  <span className="muted">{shortDate(mine[0].planned_on)} – {shortDate(mine.at(-1)!.planned_on)} · {mine.length} periods {r === 1 ? <span className="tagx g">done</span> : late ? <span className="tagx r">late</span> : done ? <span className="tagx b">{pct(r)}</span> : null}</span>
                </div>
                <div className="mt-1"><Bar value={r} color={late ? "#f59e0b" : "#0284c7"} /></div>
              </div>
            );
          })}
        </div>
      </section>

      <details className="card">
        <summary className="h2 cursor-pointer">Every lesson, day by day ({lessons.length})</summary>
        <table className="tbl mt-2 text-sm"><thead><tr><th>Day</th><th>Topic</th><th>Pages</th><th>Done</th></tr></thead><tbody>
          {lessons.map((l) => <tr key={l.id} style={l.planned_on === today ? { background: "#e0f2fe" } : undefined}><td className="whitespace-nowrap">{shortDate(l.planned_on)}</td><td>{l.is_test ? <b>📝 {l.topic}</b> : l.topic}</td><td>{l.pages ?? ""}</td><td>{l.done_on ? "✓" : ""}</td></tr>)}
        </tbody></table>
      </details>

      <details className="card">
        <summary className="h2 cursor-pointer">Fix chapters or dates</summary>
        <form action={saveChapters} className="mt-2 flex flex-col gap-2">{ids}
          <label className="field">Chapters and topics (one per line)<textarea className="input min-h-64 py-2 font-mono text-sm" name="contents" defaultValue={contentsText(chapters)} /></label>
          <button className="btn self-start" type="submit">Save chapters and re-plan</button>
        </form>
        <form action={moveFinish} className="mt-4 flex flex-wrap items-end gap-2">{ids}
          <label className="field">Finish by<input className="input" type="date" name="finish_by" defaultValue={book.finish_by} /></label>
          <button className="btn-ghost" type="submit">Move finish date</button>
        </form>
        <form action={deleteSyllabus} className="mt-4">{ids}<button className="btn-ghost text-sm text-[#b91c1c]" type="submit">Delete this plan and start again</button></form>
      </details>
    </>
  );
}
