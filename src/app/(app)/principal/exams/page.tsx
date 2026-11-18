import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { pct, shortDate, time, todayPK } from "@/lib/format";
import { PageHead, Stats, Stat, Chips, Insight, Empty, Bar, Bars, Row } from "@/components/ilm";
import { UnderTabs } from "@/components/classes-tabs";
import { fetchAll } from "@/lib/fetch-all";
import { BoardTarget, ExamDayTab, ExamGapsTab } from "./day";
import { PrintButton } from "@/app/print/paper-check/[id]/print-button";
import { addPaper, addStandardClasses, createExam, setExamStatus } from "../actions";

type Search = { tab?: string; term?: string; exam?: string; cls?: string; view?: string; show?: string; grade?: string; saved?: string; error?: string; session?: string; sec?: string; subj?: string; teacher?: string; date?: string; room?: string };
const KIND: Record<string, string> = { class_test: "Class test", monthly: "Monthly test", term: "Term exam", sendup: "Send-up", final: "Final", other: "Other" };
// Ideas for the name box; the principal can type any name instead.
const NAME_IDEAS = ["Weekly test", "Monthly test · November", "December test", "Mid-term exam", "Pre-board test", "Send-up exam", "Final exam", "Surprise quiz", "Chapter 3 test", "Summer homework test"];
const STATUS: Record<string, [string, string, string]> = {
  draft: ["Draft", "pill-gray", "var(--line)"],
  date_sheet: ["Date sheet out", "pill-blue", "var(--blue)"],
  marks_entry: ["Marks entry", "pill-orange", "var(--orange)"],
  results: ["Results out", "pill-green", "var(--green)"],
};
const NEXT: Record<string, [string, string] | undefined> = {
  draft: ["date_sheet", "Publish date sheet"],
  date_sheet: ["marks_entry", "Open marks entry"],
  marks_entry: ["results", "Publish results and lock marks"],
};

export default async function ExamsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const tab = ["results", "board", "day", "gaps"].includes(sp.tab ?? "") ? sp.tab! : "plan";
  const q = (o: Record<string, string | undefined>) => "/principal/exams?" + new URLSearchParams(Object.entries({ ...o }).filter(([, v]) => v) as [string, string][]);
  return (
    <>
      <PageHead kick="School · Exams" title="Exams, results and board prep" sub="Plan every test, see who is slipping, and lift Class 9–12 board marks with a clear plan.">
        <Link href={q({ tab: "plan" }) + "#report-cards"} className="btn-ghost">Report cards</Link>
        <Link href={q({ tab: "plan" }) + "#create"} className="btn">Create test or exam</Link>
      </PageHead>
      <UnderTabs current={tab} tabs={[
        { id: "plan", label: "Plan & marks entry", href: q({ tab: "plan" }) },
        { id: "results", label: "Results & reports", href: q({ tab: "results" }) },
        { id: "board", label: "BISE board prep · 9–12", href: q({ tab: "board" }) },
        { id: "day", label: "Exam day", href: q({ tab: "day" }) },
        { id: "gaps", label: "Gaps and checks", href: q({ tab: "gaps" }) },
      ]} />
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {tab === "plan" && <PlanTab sp={sp} />}
      {tab === "results" && <ResultsTab sp={sp} />}
      {tab === "board" && <BoardTab sp={sp} />}
      {tab === "day" && <ExamDayTab date={sp.date} roomId={sp.room} />}
      {tab === "gaps" && <ExamGapsTab />}
    </>
  );
}

async function PlanTab({ sp }: { sp: Search }) {
  const supabase = await createClient();
  const today = todayPK();
  const [{ data: terms }, { data: classes }, { data: subjects }, { data: scales }, { data: staff }, { data: sectionList }] = await Promise.all([
    supabase.from("terms").select("id, name, starts_on, ends_on, exams(id, status), academic_sessions!inner(is_current)").eq("academic_sessions.is_current", true).order("sort"),
    supabase.from("classes").select("id, name").order("sort"),
    supabase.from("subjects").select("id, name").order("name"),
    supabase.from("grading_scales").select("id, name"),
    supabase.from("profiles").select("id, full_name").in("role", ["teacher", "principal"]).order("full_name"),
    supabase.from("sections").select("id, name, classes(name, sort)"),
  ]);
  const term = (terms ?? []).find((t) => t.id === sp.term)
    ?? (terms ?? []).find((t) => t.starts_on <= today && t.ends_on >= today) ?? (terms ?? [])[0];
  const { data: exams } = term
    ? await supabase.from("exams").select("id, name, kind, starts_on, ends_on, total_marks, weight_percent, status, exam_sections(section_id)").eq("term_id", term.id).order("starts_on")
    : { data: [] };
  const exam = (exams ?? []).find((e) => e.id === sp.exam) ?? (exams ?? []).find((e) => e.status === "marks_entry") ?? (exams ?? [])[0];

  // how far teachers are with marks: entered marks vs students × subjects in the exam's sections
  const progress = new Map<string, number>();
  for (const e of exams ?? []) {
    const secIds = e.exam_sections.map((s: { section_id: string }) => s.section_id);
    const [{ count: studs }, { count: entered }] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }).in("section_id", secIds.length ? secIds : ["00000000-0000-0000-0000-000000000000"]).eq("status", "enrolled"),
      supabase.from("marks").select("id", { count: "exact", head: true }).eq("exam_id", e.id),
    ]);
    const expected = (studs ?? 0) * (subjects?.length ?? 1);
    progress.set(e.id, expected ? Math.min(1, (entered ?? 0) / expected) : 0);
  }
  // marks entry by subject teacher for the chosen exam
  const secIds: string[] = exam ? exam.exam_sections.map((x: { section_id: string }) => x.section_id) : [];
  const [{ data: papers }, { data: teach }, { data: entered }, { data: studs }] = exam
    ? await Promise.all([
      supabase.from("exam_papers").select("id, paper_date, starts_at, ends_at, classes(name, sort), subjects(name), profiles(full_name)").eq("exam_id", exam.id).order("paper_date"),
      supabase.from("section_subjects").select("section_id, subject_id, teacher_id, subjects(name), profiles(full_name), sections(name, classes(name))").in("section_id", secIds.length ? secIds : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("marks").select("subject_id, students(section_id)").eq("exam_id", exam.id),
      supabase.from("students").select("section_id").eq("status", "enrolled").in("section_id", secIds.length ? secIds : ["00000000-0000-0000-0000-000000000000"]),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  type Paper = { id: string; paper_date: string; starts_at: string | null; ends_at: string | null; classes: { name: string; sort: number }; subjects: { name: string }; profiles: { full_name: string } | null };
  type T = { section_id: string; subject_id: string; teacher_id: string | null; subjects: { name: string }; profiles: { full_name: string } | null; sections: { name: string; classes: { name: string } } };
  const size = new Map<string, number>();
  for (const st of studs ?? []) size.set(st.section_id, (size.get(st.section_id) ?? 0) + 1);
  const done = new Map<string, number>();
  for (const m of (entered ?? []) as unknown as { subject_id: string; students: { section_id: string } | null }[]) {
    const k = `${m.students?.section_id}-${m.subject_id}`; done.set(k, (done.get(k) ?? 0) + 1);
  }
  const byTeacher = new Map<string, { name: string; parts: string[]; need: number; got: number }>();
  for (const t of (teach ?? []) as unknown as T[]) {
    const key = t.teacher_id ?? "none";
    const cur = byTeacher.get(key) ?? { name: t.profiles?.full_name ?? "No teacher", parts: [], need: 0, got: 0 };
    cur.parts.push(`${t.subjects.name} ${t.sections.classes.name.replace("Class ", "")}-${t.sections.name}`);
    cur.need += size.get(t.section_id) ?? 0; cur.got += Math.min(size.get(t.section_id) ?? 0, done.get(`${t.section_id}-${t.subject_id}`) ?? 0);
    byTeacher.set(key, cur);
  }
  const teacherRows = [...byTeacher.values()].sort((a, b) => a.got / Math.max(1, a.need) - b.got / Math.max(1, b.need));
  const late = exam?.ends_on && exam.ends_on < today;

  return (
    <>
      <ol className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }} aria-label="Terms">
        {(terms ?? []).map((t) => {
          const tag = t.ends_on < today ? ["Done", "g"] : t.starts_on <= today ? ["Now", "b"] : ["Later", ""];
          return (
            <li key={t.id}>
              <Link href={`/principal/exams?term=${t.id}`} className={`card flex flex-col gap-1 ${t.id === term?.id ? "!border-[#7dd3fc] !bg-[#f0f9ff] !shadow-[0_4px_0_#7dd3fc]" : ""}`}>
                <span className={`tagx ${tag[1]} self-start`}>{tag[0]}</span>
                <span className="text-[17px] font-black">{t.name}</span>
                <span className="muted text-[12px]">{shortDate(t.starts_on)} – {shortDate(t.ends_on)} · {t.exams.length} test{t.exams.length === 1 ? "" : "s"}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {(terms ?? []).length === 0 && <Empty>No terms in the current session. Add them in Settings → Session.</Empty>}

      <section className="flex flex-wrap items-start gap-5">
        <div className="card flex min-w-0 flex-[3_1_480px] flex-col gap-2">
          <h2 className="h2">Marks entry{exam ? ` · ${exam.name}` : ""}</h2>
          {exam ? <p className="muted text-[13px]">{KIND[exam.kind]} · {exam.exam_sections.length} sections · out of {exam.total_marks} · {STATUS[exam.status][0]}. Marks lock when you publish results.</p>
            : <Empty>Nothing planned in this term yet. Create a test below.</Empty>}
          {exam && teacherRows.map((t) => {
            const r = t.need ? t.got / t.need : 0;
            return (
              <Row key={t.name + t.parts[0]}>
                <span className="min-w-[180px] flex-[1_1_220px] text-[14px] font-bold"><b className="font-black">{t.name}</b> · {t.parts.join(", ")}</span>
                <div className="min-w-[100px] flex-1"><Bar value={r} color={r >= 1 ? "#16a34a" : r > 0 ? "#0284c7" : "#e5e7eb"} /></div>
                <span className={`tagx ${r >= 1 ? "g" : late ? "r" : r > 0 ? "b" : "y"}`}>{r >= 1 ? "Done" : r > 0 ? pct(r) : late ? "Late" : "Not started"}</span>
              </Row>
            );
          })}
          {exam && teacherRows.length === 0 && <p className="muted text-[13px]">No subject teachers are set for these sections, so marks can&apos;t be tracked by teacher. Overall: {pct(progress.get(exam.id) ?? 0)} entered.</p>}

          <div className="kick mt-3">All tests in {term?.name}</div>
          {(exams ?? []).map((e) => {
            const st = STATUS[e.status]; const pr = progress.get(e.id) ?? 0; const next = NEXT[e.status];
            return (
              <Row key={e.id}>
                <Link href={`/principal/exams?term=${term!.id}&exam=${e.id}`} className="min-w-0 flex-[1_1_220px]">
                  <div className={`font-black ${e.id === exam?.id ? "text-[#0369a1]" : ""}`}>{e.name}</div>
                  <div className="muted text-[12px]">{KIND[e.kind]} · {e.starts_on ? `${shortDate(e.starts_on)} – ${shortDate(e.ends_on ?? e.starts_on)}` : "No dates"} · counts {Number(e.weight_percent)}% · {pct(pr)} marks in</div>
                </Link>
                <span className={`tagx ${{ draft: "", date_sheet: "b", marks_entry: "y", results: "g" }[e.status as string]}`}>{st[0]}</span>
                {next && (
                  <form action={setExamStatus}>
                    <input type="hidden" name="exam_id" value={e.id} /><input type="hidden" name="term_id" value={term!.id} /><input type="hidden" name="status" value={next[0]} />
                    <button className={next[0] === "results" ? "btn" : "btn-ghost"} style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }} type="submit">{next[1]}</button>
                  </form>
                )}
              </Row>
            );
          })}
          <div className="mt-2 flex flex-wrap gap-2.5">
            <Link href="/teacher/paper-check" className="btn-ghost">Check with AI paper checking</Link>
            <Link href="/principal/exams?tab=results" className="btn-ghost">See results</Link>
          </div>
        </div>

        <div className="card flex min-w-0 flex-[2_1_320px] flex-col gap-2">
          <h2 className="h2">Date sheet</h2>
          {exam && ((papers ?? []) as unknown as Paper[]).map((p) => (
            <Row key={p.id}>
              <span className="w-[72px] font-black tabular-nums">{shortDate(p.paper_date)}</span>
              <span className="flex-1 font-bold">{p.subjects.name} · {p.classes.name}</span>
              <span className="muted text-[12px]">{time(p.starts_at)}{p.ends_at ? `–${time(p.ends_at)}` : ""}{p.profiles ? ` · ${p.profiles.full_name}` : ""}</span>
            </Row>
          ))}
          {exam && (papers ?? []).length === 0 && <Empty>No papers on the date sheet yet.</Empty>}
          {exam && (
            <form action={addPaper} className="mt-2 grid grid-cols-2 items-end gap-2">
              <input type="hidden" name="exam_id" value={exam.id} /><input type="hidden" name="term_id" value={term!.id} />
              <label className="field">Class<select className="input" name="class_id">{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="field">Subject<select className="input" name="subject_id">{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label className="field">Date<input className="input" type="date" name="paper_date" required /></label>
              <label className="field">Invigilator<select className="input" name="invigilator_id"><option value="">None</option>{(staff ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label>
              <label className="field">Starts<input className="input" type="time" name="starts_at" defaultValue="08:30" /></label>
              <label className="field">Ends<input className="input" type="time" name="ends_at" defaultValue="11:00" /></label>
              <button className="btn col-span-2" type="submit">Add paper</button>
            </form>
          )}
          <p className="muted text-[12px]">One paper per class and subject; adding it again moves it.</p>
        </div>
      </section>

      <section className="flex flex-wrap items-start gap-5">
        <form id="create" action={createExam} className="card flex min-w-0 flex-[3_1_480px] scroll-mt-6 flex-col gap-3">
          <h2 className="h2">Create a test or exam</h2>
          <input type="hidden" name="term_id" value={term?.id ?? ""} /><input type="hidden" name="back" value="exams" />
          <label className="field">Name (write any name you like)
            <input className="input" name="name" required list="exam-name-ideas" placeholder="December test, Pre-board, Chapter 3 quiz" />
            <datalist id="exam-name-ideas">{NAME_IDEAS.map((n) => <option key={n} value={n} />)}</datalist>
          </label>
          <label className="field">Kind (for the report card)
            <select className="input" name="kind">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <fieldset className="field">
            <legend className="mb-1.5">Classes</legend>
            <div className="flex flex-wrap gap-2">
              {(classes ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 rounded-xl border-2 border-[#e5e7eb] bg-white px-3 py-1.5 text-sm">
                  <input type="checkbox" name="class_id" value={c.id} defaultChecked /> {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          {(classes ?? []).length < 10 && (
            <p className="muted">Only {(classes ?? []).length} classes are set up. <button formAction={addStandardClasses} formNoValidate className="underline" type="submit">Add Class 1 to Class 10</button></p>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="field">Starts<input className="input" type="date" name="starts_on" /></label>
            <label className="field">Ends<input className="input" type="date" name="ends_on" /></label>
            <label className="field">Total marks<input className="input" type="number" name="total_marks" defaultValue={25} min={1} /></label>
            <label className="field">Counts toward final %<input className="input" type="number" name="weight_percent" defaultValue={10} min={0} max={100} /></label>
          </div>
          <label className="field">Grading
            <select className="input" name="grading_scale_id">{(scales ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          </label>
          <button className="btn self-start" type="submit">Create</button>
          <p className="muted text-[13px]">Subject teachers fill marks when you open marks entry. Publishing results locks them.</p>
        </form>
        <form id="report-cards" action="/print/report-cards" target="_blank" className="card flex min-w-0 flex-[2_1_320px] scroll-mt-6 flex-col gap-3">
          <h2 className="h2">Report cards</h2>
          <p className="muted text-[14px]">Every student&apos;s card for one section: marks of all published exams this session, grade, position in class and attendance. Print on A4.</p>
          <label className="field">Section
            <select className="input" name="section" required>
              {((sectionList ?? []) as unknown as { id: string; name: string; classes: { name: string; sort: number } }[])
                .sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name))
                .map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}</option>)}
            </select>
          </label>
          <button className="btn self-start" type="submit">Open report cards</button>
        </form>
      </section>
    </>
  );
}

// ---------- results: every mark of published exams this session ----------
type Mark = { exam_id: string; obtained: number; subject_id: string; subjects: { name: string }; students: { id: string; full_name: string; section_id: string; sections: { name: string; class_id: string; classes: { name: string } } } };

// Every mark of published exams in a session (the current one unless asked), read in full.
async function sessionResults(classIds?: string[], sessionId?: string) {
  const supabase = await createClient();
  let eq = supabase.from("exams").select("id, name, starts_on, total_marks, terms!inner(session_id, academic_sessions!inner(is_current))").eq("status", "results");
  eq = sessionId ? eq.eq("terms.session_id", sessionId) : eq.eq("terms.academic_sessions.is_current", true);
  const { data: exams } = await eq.order("starts_on", { ascending: true, nullsFirst: true });
  const ids = (exams ?? []).map((e) => e.id);
  const marks = ids.length ? await fetchAll<Mark>((f, t) => {
    let qy = supabase.from("marks").select("exam_id, obtained, subject_id, subjects(name), students!inner(id, full_name, section_id, sections!inner(name, class_id, classes(name)))")
      .in("exam_id", ids).eq("is_absent", false).not("obtained", "is", null);
    if (classIds?.length) qy = qy.in("students.sections.class_id", classIds);
    return qy.order("id").range(f, t) as unknown as PromiseLike<{ data: Mark[] | null; error: unknown }>;
  }) : [];
  const total = new Map((exams ?? []).map((e) => [e.id, e.total_marks || 100]));
  return { exams: exams ?? [], marks: marks.map((m) => ({ ...m, r: Number(m.obtained) / (total.get(m.exam_id) ?? 100) })) };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function group<T>(xs: T[], key: (x: T) => string) { const m = new Map<string, T[]>(); for (const x of xs) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); } return m; }
const GRADES = [["A+", 0.8], ["A", 0.7], ["B", 0.6], ["C", 0.5], ["D", 0.4], ["F", 0]] as const;
const grade = (r: number) => GRADES.find(([, min]) => r >= min)![0];

async function ResultsTab({ sp }: { sp: Search }) {
  const supabase = await createClient();
  const [{ data: classes }, { data: sessions }, { data: sections }, { data: subjectList }, { data: teach }] = await Promise.all([
    supabase.from("classes").select("id, name").order("sort"),
    supabase.from("academic_sessions").select("id, name, is_current").order("starts_on", { ascending: false }),
    supabase.from("sections").select("id, name, class_id"),
    supabase.from("subjects").select("id, name").order("name"),
    supabase.from("section_subjects").select("section_id, subject_id, teacher_id, profiles(full_name)"),
  ]);
  const cls = (classes ?? []).find((c) => c.id === sp.cls);
  const { exams, marks: all } = await sessionResults(cls ? [cls.id] : undefined, sp.session || undefined);
  const exam = sp.exam === "all" ? undefined : exams.find((e) => e.id === sp.exam) ?? exams.at(-1);
  const teacherOf = new Map(((teach ?? []) as unknown as { section_id: string; subject_id: string; teacher_id: string | null; profiles: { full_name: string } | null }[])
    .map((t) => [`${t.section_id}|${t.subject_id}`, { id: t.teacher_id, name: t.profiles?.full_name ?? "No teacher" }]));
  const teachers = [...new Map([...teacherOf.values()].filter((t) => t.id).map((t) => [t.id!, t.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const inScope = (m: (typeof all)[number]) => (!sp.sec || m.students.section_id === sp.sec) && (!sp.subj || m.subject_id === sp.subj)
    && (!sp.teacher || teacherOf.get(`${m.students.section_id}|${m.subject_id}`)?.id === sp.teacher);
  const scoped = all.filter(inScope);
  const marks = scoped.filter((m) => !exam || m.exam_id === exam.id);
  const view = ["class", "student", "teacher", "subject"].includes(sp.view ?? "") ? sp.view! : "class";
  const show = sp.show ?? "all";
  const perStudent = [...group(marks, (m) => m.students.id).values()].map((ms) => ({
    id: ms[0].students.id, name: ms[0].students.full_name, cls: `${ms[0].students.sections.classes.name}-${ms[0].students.sections.name}`,
    r: avg(ms.map((m) => m.r))!, low: [...new Set(ms.filter((m) => m.r < 0.4).map((m) => m.subjects.name))],
  }));
  const prev = exam ? exams[exams.findIndex((e) => e.id === exam.id) - 1] : undefined;
  const prevBy = new Map(prev ? [...group(scoped.filter((m) => m.exam_id === prev.id), (m) => m.students.id).entries()].map(([k, v]) => [k, avg(v.map((m) => m.r))!]) : []);
  const prevAvg = prev ? avg([...prevBy.values()]) : null;
  const average = avg(perStudent.map((s) => s.r));
  const pass = perStudent.filter((s) => s.r >= 0.4).length;
  const atRisk = perStudent.filter((s) => s.low.length > 0);
  const trend = exams.map((e) => ({ label: e.name.length > 12 ? e.name.slice(0, 11) + "…" : e.name, r: avg(scoped.filter((m) => m.exam_id === e.id).map((m) => m.r)) })).filter((t) => t.r != null);
  const spread = GRADES.map(([g]) => ({ g, n: perStudent.filter((s) => grade(s.r) === g).length }));
  const q = (o: Partial<Search>) => "/principal/exams?" + new URLSearchParams(Object.entries({ tab: "results", session: sp.session, exam: sp.exam, cls: sp.cls, sec: sp.sec, subj: sp.subj, teacher: sp.teacher, view, show, ...o }).filter(([, v]) => v) as [string, string][]);
  const status = (a: number) => (a >= 0.7 ? ["Strong", "g"] : a >= 0.5 ? ["OK", "b"] : ["Weak", "r"]);

  let rows: { a: string; b: string; c: string; d: string; e: string; ec: string; href?: string }[] = [];
  let head = ["", "", "", "", ""];
  if (view === "class") {
    head = ["Section", "Students", "Average", "Pass rate", "Status"];
    rows = [...group(perStudent, (s) => s.cls).entries()].sort().map(([k, v]) => { const a = avg(v.map((s) => s.r))!; const st = status(a);
      return { a: k, b: String(v.length), c: pct(a), d: pct(v.filter((s) => s.r >= 0.4).length / v.length), e: st[0], ec: st[1] }; });
  } else if (view === "student") {
    head = ["Student", "Class", "Average", prev ? `Change vs ${prev.name}` : "Grade", "Weak subjects"];
    let list = [...perStudent].sort((a, b) => b.r - a.r);
    if (show === "low") list = list.filter((s) => s.r < 0.5);
    if (show === "top") list = list.slice(0, 10);
    if (show === "drop") list = list.filter((s) => prevBy.has(s.id) && s.r - prevBy.get(s.id)! <= -0.1);
    rows = list.slice(0, 300).map((s) => ({ a: s.name, b: s.cls, c: pct(s.r), d: prevBy.has(s.id) ? `${s.r >= prevBy.get(s.id)! ? "+" : ""}${Math.round((s.r - prevBy.get(s.id)!) * 100)} pts` : grade(s.r), e: s.low.join(", ") || "—", ec: s.low.length ? "r" : "g", href: `/principal/students/${s.id}` }));
  } else if (view === "teacher") {
    head = ["Teacher", "Subjects · sections", "Average", "Pass rate", "Status"];
    rows = [...group(marks, (m) => teacherOf.get(`${m.students.section_id}|${m.subject_id}`)?.name ?? "No teacher").entries()].map(([k, v]) => {
      const a = avg(v.map((m) => m.r))!; const st = status(a);
      const what = [...new Set(v.map((m) => `${m.subjects.name} ${m.students.sections.classes.name.replace("Class ", "")}-${m.students.sections.name}`))];
      return { a: k, b: what.slice(0, 4).join(", ") + (what.length > 4 ? ` +${what.length - 4}` : ""), c: pct(a), d: pct(v.filter((m) => m.r >= 0.4).length / v.length), e: st[0], ec: st[1] };
    }).sort((x, y) => parseFloat(x.c) - parseFloat(y.c));
  } else {
    head = ["Subject", "Marks", "Average", "Below 40%", "Status"];
    rows = [...group(marks, (m) => m.subjects.name).entries()].map(([k, v]) => ({ k, v, a: avg(v.map((m) => m.r))! })).sort((x, y) => x.a - y.a)
      .map(({ k, v, a }) => { const st = status(a); return { a: k, b: String(v.length), c: pct(a), d: String(v.filter((m) => m.r < 0.4).length), e: st[0], ec: st[1] }; });
  }

  return (
    <>
      <form className="card grid items-end gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <input type="hidden" name="tab" value="results" /><input type="hidden" name="view" value={view} />
        <label className="field">Session<select className="input" name="session" defaultValue={sp.session ?? ""}>{(sessions ?? []).map((x) => <option key={x.id} value={x.is_current ? "" : x.id}>{x.name}</option>)}</select></label>
        <label className="field">Test<select className="input" name="exam" defaultValue={sp.exam ?? exam?.id ?? ""}><option value="all">All tests this session</option>{exams.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label className="field">Class<select className="input" name="cls" defaultValue={sp.cls ?? ""}><option value="">All classes</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field">Section<select className="input" name="sec" defaultValue={sp.sec ?? ""}><option value="">All</option>{(sections ?? []).filter((x) => !cls || x.class_id === cls.id).map((x) => <option key={x.id} value={x.id}>{(classes ?? []).find((c) => c.id === x.class_id)?.name}-{x.name}</option>)}</select></label>
        <label className="field">Subject<select className="input" name="subj" defaultValue={sp.subj ?? ""}><option value="">All subjects</option>{(subjectList ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field">Teacher<select className="input" name="teacher" defaultValue={sp.teacher ?? ""}><option value="">All teachers</option>{teachers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
        <label className="field">Show<select className="input" name="show" defaultValue={show}><option value="all">Everyone</option><option value="low">Below 50%</option><option value="top">Top 10</option><option value="drop">Dropped 10+ pts</option></select></label>
        <button className="btn-ghost" type="submit">Apply</button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Chips label="Report view" current={view} items={[{ id: "class", label: "By class" }, { id: "student", label: "By student" }, { id: "teacher", label: "By teacher" }, { id: "subject", label: "By subject" }].map((v) => ({ ...v, href: q({ view: v.id }) }))} />
        <div className="flex gap-2"><PrintButton /><Link href="/principal/exams#report-cards" className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }}>Report cards</Link></div>
      </div>
      {!exams.length ? <Empty>No results published in this session yet. Publish an exam&apos;s results on the Plan tab and they show here.</Empty> : (
        <>
          <Stats>
            <Stat label="Average" value={average != null ? pct(average) : "—"} sub={prevAvg != null && average != null ? `${average >= prevAvg ? "▲" : "▼"} ${Math.abs(Math.round((average - prevAvg) * 100))} pts since ${prev!.name}` : exam?.name ?? "all tests"} />
            <Stat label="Pass rate" value={perStudent.length ? pct(pass / perStudent.length) : "—"} sub={`${pass} of ${perStudent.length} students · 40%+`} />
            <Stat label="A+ and A" value={perStudent.filter((s) => s.r >= 0.7).length} sub="70% and above" tone="#15803d" />
            <Stat label="At risk" value={atRisk.length} sub="below 40% in 1+ subject" tone={atRisk.length ? "#b91c1c" : undefined} />
          </Stats>
          <section className="flex flex-wrap items-start gap-5">
            <div className="card min-w-0 flex-[3_1_480px]">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">{cls ? cls.name : "School"} average · test by test</h2><span className="muted text-[12px]">Each bar is one published test</span></div>
              <div className="mt-4">{trend.length ? <Bars bars={trend.map((t) => ({ label: t.label, value: Math.round(t.r! * 100), note: pct(t.r!), color: t.r! >= 0.5 ? "#16a34a" : "#f59e0b" }))} /> : <Empty>No marks yet.</Empty>}</div>
            </div>
            <div className="card min-w-0 flex-[2_1_300px]">
              <h2 className="h2">Grade spread</h2>
              {spread.map((g) => (
                <Row key={g.g}><span className="w-8 font-black">{g.g}</span><div className="flex-1"><Bar value={perStudent.length ? g.n / perStudent.length : 0} color={g.g === "F" ? "#ef4444" : g.g === "D" ? "#f59e0b" : "#16a34a"} /></div><span className="w-10 text-right font-black tabular-nums">{g.n}</span></Row>
              ))}
            </div>
          </section>
          <section className="card">
            <h2 className="h2">{{ class: "By class", student: "By student", teacher: "By teacher", subject: "By subject" }[view]} · {exam?.name ?? "all tests"}</h2>
            <p className="muted text-[13px]">{cls ? cls.name : "All classes"}{view === "subject" ? " · chapter detail comes from AI paper checking" : ""}</p>
            <div className="tbl mt-2 overflow-x-auto"><table className="w-full">
              <thead><tr>{head.map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.a + r.b}><td>{r.href ? <Link href={r.href} className="font-black text-[#0369a1]">{r.a}</Link> : <b>{r.a}</b>}</td><td className="text-[13px]">{r.b}</td><td className="tabular-nums">{r.c}</td><td className="tabular-nums">{r.d}</td><td><span className={`tagx ${r.ec}`}>{r.e}</span></td></tr>
              ))}</tbody>
            </table></div>
            {rows.length === 0 && <Empty>No marks match.</Empty>}
          </section>
        </>
      )}
    </>
  );
}

async function BoardTab({ sp }: { sp: Search }) {
  const supabase = await createClient();
  const { data: classes } = await supabase.from("classes").select("id, name, sort, board").gte("sort", 9).order("sort");
  const cls = (classes ?? []).find((c) => c.id === sp.grade) ?? (classes ?? [])[0];
  if (!cls) return <Empty>No Class 9 to 12 set up yet. Board prep shows once those classes exist.</Empty>;
  const { exams, marks } = await sessionResults([cls.id]);
  const perStudent = [...group(marks, (m) => m.students.id).values()].map((ms) => {
    const subj = [...group(ms, (m) => m.subjects.name).entries()].map(([n, v]) => ({ n, r: avg(v.map((m) => m.r))! }));
    return { id: ms[0].students.id, name: ms[0].students.full_name, sec: ms[0].students.sections.name, r: avg(ms.map((m) => m.r))!, weak: subj.filter((s) => s.r < 0.33).map((s) => s.n), subj };
  });
  const pred = avg(perStudent.map((s) => s.r));
  const risk = perStudent.filter((s) => s.weak.length);
  const subjects = [...group(marks, (m) => m.subjects.name).entries()].map(([n, v]) => ({ n, r: avg(v.map((m) => m.r))!, low: new Set(v.filter((m) => m.r < 0.4).map((m) => m.students.id)).size })).sort((a, b) => a.r - b.r);
  const push = [...perStudent].filter((s) => s.r < 0.5 || s.weak.length).sort((a, b) => a.r - b.r).slice(0, 8);
  const [{ data: tset }, { count: pastPapers }] = await Promise.all([
    supabase.from("campus_settings").select("board_target").maybeSingle(),
    supabase.from("question_papers").select("id", { count: "exact", head: true }).eq("class_id", cls.id),
  ]);
  const target = tset?.board_target ?? null;
  const { count: boardReady } = await supabase.from("students").select("id, sections!inner(class_id)", { count: "exact", head: true }).eq("sections.class_id", cls.id).eq("status", "enrolled");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Chips label="Board class" current={cls.id} items={(classes ?? []).map((c) => ({ id: c.id, label: c.name, href: `/principal/exams?tab=board&grade=${c.id}` }))} />
        <span className="kick">{cls.board || "Board not set"} · from {exams.length} published test{exams.length === 1 ? "" : "s"} this session</span>
        <BoardTarget back={`/principal/exams?tab=board&grade=${cls.id}`} />
      </div>
      <Stats>
        <Stat label="Predicted board avg" value={pred != null ? pct(pred) : "—"} sub={`from ${exams.length} school tests`} />
        <Stat label="Target" value={target ? `${target}%` : "—"} sub={target && pred != null ? `${pred * 100 >= target ? "on track" : `${Math.round(target - pred * 100)} pts to go`}` : "set it below"} />
        <Stat label="Students" value={boardReady ?? 0} sub={<Link href="/principal/students/board" className="text-[#0369a1]">Board registration →</Link>} />
        <Stat label="Past papers made" value={pastPapers ?? 0} sub="question papers for this class" />
        <Stat label="On track for A+" value={perStudent.filter((s) => s.r >= 0.8).length} sub="80%+ average" tone="#15803d" />
        <Stat label="Might fail a paper" value={risk.length} sub="below 33% in a subject" tone={risk.length ? "#b91c1c" : undefined} />
      </Stats>
      {!marks.length ? <Empty>No published marks for {cls.name} this session yet. Predictions appear after the first results.</Empty> : (
        <>
          <section className="card">
            <Insight title={`Plan to raise marks · ${cls.name}`}>
              <ol className="ml-5 list-decimal">
                {subjects.slice(0, 2).map((s) => <li key={s.n}>{s.n} is weakest at {pct(s.r)}: {s.low} student{s.low === 1 ? "" : "s"} below 40%. Add a weekly chapter test and an extra period.</li>)}
                {risk.length > 0 && <li>{risk.length} student{risk.length === 1 ? " is" : "s are"} below 33% in at least one subject: put them in an after-school class and call parents.</li>}
                <li>Start past papers once the syllabus is finished; check them with AI paper checking.</li>
              </ol>
            </Insight>
            <div className="mt-3 flex flex-wrap gap-2.5">
              <Link href="/principal/classes?tab=timetable" className="btn">Open timetable</Link>
              <Link href="/principal/notices" className="btn-ghost">Share with teachers</Link>
            </div>
          </section>
          <section className="flex flex-wrap items-start gap-5">
            <div className="card min-w-0 flex-[3_1_480px]">
              <h2 className="h2">Weak subjects · where marks are lost</h2>
              <p className="muted text-[13px]">Average of every published test this session. Chapter detail comes from AI paper checking.</p>
              {subjects.map((s) => (
                <Row key={s.n}>
                  <div className="min-w-[140px] flex-1"><div className="font-black">{s.n}</div><div className="muted text-[12px]">{s.low} below 40%</div></div>
                  <div className="min-w-[100px] flex-1"><Bar value={s.r} color={s.r < 0.5 ? "#ef4444" : s.r < 0.7 ? "#f59e0b" : "#16a34a"} /></div>
                  <span className="w-12 text-right font-black tabular-nums">{pct(s.r)}</span>
                  <Link href="/teacher/paper-check/papers" className="btn-ghost" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }}>Practice paper</Link>
                </Row>
              ))}
            </div>
            <div className="card min-w-0 flex-[2_1_320px]">
              <div className="flex items-center justify-between"><h2 className="h2">Students to push</h2>{risk.length > 0 && <span className="tagx r">{risk.length} at risk</span>}</div>
              {push.map((s) => (
                <Row key={s.id}>
                  <div className="min-w-0 flex-1"><Link href={`/principal/students/${s.id}`} className="font-black">{s.name}</Link>
                    <div className="muted text-[12px]">{cls.name}-{s.sec} · {s.weak.length ? `below 33% in ${s.weak.join(", ")}` : "average under 50%"}</div></div>
                  <span className={`tagx ${s.weak.length ? "r" : "y"}`}>{pct(s.r)}</span>
                </Row>
              ))}
              {push.length === 0 && <Empty>Everyone is above 50% with no failing subject.</Empty>}
            </div>
          </section>
        </>
      )}
      <section className="card">
        <h2 className="h2">Board prep calendar</h2>
        <p className="muted text-[13px]">A suggested order of work. Set the dates as tests on the Plan tab and teachers see them in their app.</p>
        <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {[["Step 1", "Finish syllabus", "Weekly chapter tests"], ["Step 2", "Past papers", "Two a week, checked with AI"], ["Step 3", "Send-up", "Full board pattern, timed"], ["Step 4", "Revision", "Only each student's weak subjects"]].map(([k, t, d]) => (
            <div key={k} className="rounded-[14px] border-2 border-[#eef2f7] p-3"><div className="kick">{k}</div><div className="font-black">{t}</div><div className="muted text-[13px]">{d}</div></div>
          ))}
        </div>
      </section>
    </>
  );
}
