import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { pct, shortDate, time, todayPK } from "@/lib/format";
import { Empty } from "@/components/ilm";
import { dayLabel, hours, positions, timeSaved } from "@/lib/exam-flow";
import { addPaper, addStandardClasses, createExam, setExamStatus } from "../actions";
import { autoDateSheet, remindLateTeachers, sendDateSheet, sendResults } from "./actions";

export type FlowSearch = { term?: string; exam?: string; step?: string; tpl?: string; new?: string; saved?: string };

const KIND: Record<string, string> = { class_test: "Class test", monthly: "Monthly test", term: "Term exam", sendup: "Send-up", final: "Final", other: "Other" };
const STATUS: Record<string, [string, string]> = { draft: ["Draft", ""], date_sheet: ["Date sheet out", "b"], marks_entry: ["Marks entry", "y"], results: ["Results out", "g"] };
// One tap fills the form; every box can still be changed.
const TEMPLATES = [
  { id: "weekly", label: "Weekly test", name: "Weekly test", kind: "class_test", total: 20, weight: 5, days: 1 },
  { id: "monthly", label: "Monthly test", name: "Monthly test", kind: "monthly", total: 50, weight: 10, days: 7 },
  { id: "mid", label: "Mid-term", name: "Mid-term exam", kind: "term", total: 100, weight: 30, days: 10 },
  { id: "sendup", label: "Send-up (9–10)", name: "Send-up exam", kind: "sendup", total: 100, weight: 20, days: 12 },
  { id: "final", label: "Final exam", name: "Final exam", kind: "final", total: 100, weight: 50, days: 12 },
];
const STEPS = [
  { id: "setup", n: 1, label: "Make the exam" },
  { id: "sheet", n: 2, label: "Date sheet" },
  { id: "day", n: 3, label: "Papers & exam days" },
  { id: "marks", n: 4, label: "Marks" },
  { id: "result", n: 5, label: "Result" },
] as const;
const sm = { minHeight: 36, padding: "0 12px", fontSize: 12 };
const NONE = ["00000000-0000-0000-0000-000000000000"];
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function savedNote(s?: string) {
  if (!s) return null;
  const p = s.split("-");
  if (p[0] === "sent") return `${p[1]} families queued on WhatsApp or SMS${Number(p[2]) ? `, ${p[2]} have no mobile number` : ""}. ${Number(p[3]) ? `${p[3]} sent now, the rest go out` : "They go out"} from Settings → WhatsApp.`;
  if (p[0] === "reminded") return `Reminder sent to ${p[1]} teacher${p[1] === "1" ? "" : "s"}${p[2] === "0" ? " (they see it when they open the app)" : ""}.`;
  if (p[0] === "datesheet") return "Date sheet made. Check it, then publish it and send it to parents.";
  return "Saved.";
}

// The Plan tab: one exam at a time, walked through five steps, each with the one thing to do next.
export async function ExamFlow({ sp }: { sp: FlowSearch }) {
  const supabase = await createClient();
  const today = todayPK();
  const [{ data: terms }, { data: classes }, { data: scales }] = await Promise.all([
    supabase.from("terms").select("id, name, starts_on, ends_on, exams(id), academic_sessions!inner(is_current)").eq("academic_sessions.is_current", true).order("sort"),
    supabase.from("classes").select("id, name").order("sort"),
    supabase.from("grading_scales").select("id, name"),
  ]);
  const term = (terms ?? []).find((t) => t.id === sp.term) ?? (terms ?? []).find((t) => t.starts_on <= today && t.ends_on >= today) ?? (terms ?? [])[0];
  const { data: exams } = term
    ? await supabase.from("exams").select("id, name, kind, starts_on, ends_on, total_marks, weight_percent, status, created_at, exam_sections(section_id)").eq("term_id", term.id).order("starts_on", { nullsFirst: false })
    : { data: [] };
  const list = exams ?? [];
  const creating = sp.new === "1" || !list.length;
  const exam = creating ? undefined : list.find((e) => e.id === sp.exam) ?? list.find((e) => e.status !== "results") ?? list.at(-1);
  const base = (o: Record<string, string | undefined>) => "/principal/exams?" + new URLSearchParams(Object.entries({ term: term?.id, ...o }).filter(([, v]) => v) as [string, string][]);
  const note = savedNote(sp.saved);

  return (
    <>
      {note && <div className="notice-ok">{note}</div>}
      {(terms ?? []).length === 0 ? <Empty>No terms in the current session. Add them in Settings → School year first.</Empty> : (
        <div className="flex flex-wrap items-center gap-2">
          {(terms ?? []).map((t) => (
            <Link key={t.id} href={`/principal/exams?term=${t.id}`} className={`tagx ${t.id === term?.id ? "b" : ""}`} style={{ fontSize: 12, padding: "6px 12px" }}>
              {t.name} · {t.exams.length}
            </Link>
          ))}
        </div>
      )}

      {term && (
        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Exams in this term">
          {list.map((e) => (
            <Link key={e.id} href={base({ exam: e.id })} aria-current={e.id === exam?.id ? "true" : undefined}
              className={`card flex min-w-[170px] flex-col gap-1 !p-3 ${e.id === exam?.id ? "!border-[#7dd3fc] !bg-[#f0f9ff] !shadow-[0_4px_0_#7dd3fc]" : ""}`}>
              <span className={`tagx ${STATUS[e.status][1]} self-start`}>{STATUS[e.status][0]}</span>
              <span className="font-black leading-tight">{e.name}</span>
              <span className="muted text-[12px]">{e.starts_on ? `${shortDate(e.starts_on)}${e.ends_on && e.ends_on !== e.starts_on ? ` – ${shortDate(e.ends_on)}` : ""}` : "No dates yet"}</span>
            </Link>
          ))}
          <Link href={base({ new: "1" }) + "#create"} className={`card flex min-w-[150px] flex-col items-center justify-center gap-1 !p-3 text-center ${creating ? "!border-[#86efac] !bg-[#f0fdf4]" : ""}`}>
            <span className="text-[26px] leading-none font-black text-[#16a34a]">+</span>
            <span className="font-black">New exam</span>
          </Link>
        </nav>
      )}

      {creating && term && <CreateCard termId={term.id} tpl={sp.tpl} classes={classes ?? []} scales={scales ?? []} base={base} today={today} />}
      {exam && term && <Steps exam={exam} termId={term.id} step={sp.step} base={base} today={today} />}

      <form id="report-cards" action="/print/report-cards" target="_blank" className="card flex flex-row flex-wrap items-end gap-3 scroll-mt-6">
        <div className="min-w-[220px] flex-1">
          <h2 className="h2">Report cards</h2>
          <p className="muted text-[13px]">All published exams this session, grade, position and attendance for one section. A4.</p>
        </div>
        <SectionSelect />
        <button className="btn" type="submit">Open report cards</button>
      </form>
    </>
  );
}

async function SectionSelect({ only }: { only?: string[] }) {
  const supabase = await createClient();
  const { data } = await supabase.from("sections").select("id, name, classes(name, sort)");
  const list = ((data ?? []) as unknown as { id: string; name: string; classes: { name: string; sort: number } }[])
    .filter((s) => !only || only.includes(s.id)).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  return <label className="field">Section<select className="input" name="section" required>{list.map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}</option>)}</select></label>;
}

function CreateCard({ termId, tpl, classes, scales, base, today }: {
  termId: string; tpl?: string; classes: { id: string; name: string }[]; scales: { id: string; name: string }[];
  base: (o: Record<string, string | undefined>) => string; today: string;
}) {
  const t = TEMPLATES.find((x) => x.id === tpl) ?? TEMPLATES[1];
  const start = addDays(today, 7);
  return (
    <form id="create" action={createExam} className="card flex scroll-mt-6 flex-col gap-3" key={t.id}>
      <div>
        <h2 className="h2">New exam</h2>
        <p className="muted text-[13px]">Pick a kind. It fills the boxes; change anything.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((x) => (
          <Link key={x.id} href={base({ new: "1", tpl: x.id }) + "#create"} scroll={false}
            className={`inline-flex min-h-10 items-center rounded-xl border-2 px-4 text-[14px] font-extrabold ${x.id === t.id ? "border-[#7dd3fc] bg-[#e0f2fe] text-[#0369a1]" : "border-[#e5e7eb] bg-white"}`}>
            {x.label} · {x.total}
          </Link>
        ))}
      </div>
      <input type="hidden" name="term_id" value={termId} /><input type="hidden" name="back" value="exams" /><input type="hidden" name="kind" value={t.kind} />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <label className="field" style={{ gridColumn: "span 2" }}>Name<input className="input" name="name" required defaultValue={t.name} /></label>
        <label className="field">First paper<input className="input" type="date" name="starts_on" defaultValue={start} /></label>
        <label className="field">Last paper<input className="input" type="date" name="ends_on" defaultValue={addDays(start, t.days - 1)} /></label>
        <label className="field">Marks per paper<input className="input" type="number" name="total_marks" defaultValue={t.total} min={1} /></label>
        <label className="field">Counts in final %<input className="input" type="number" name="weight_percent" defaultValue={t.weight} min={0} max={100} /></label>
      </div>
      <fieldset className="field">
        <legend className="mb-1.5">Classes</legend>
        <div className="flex flex-wrap gap-2">
          {classes.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 rounded-xl border-2 border-[#e5e7eb] bg-white px-3 py-1.5 text-sm font-bold">
              <input type="checkbox" name="class_id" value={c.id} defaultChecked={t.id !== "sendup" || /(9|10)\b/.test(c.name)} /> {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      {classes.length < 10 && <p className="muted text-[13px]">Only {classes.length} classes are set up. <button formAction={addStandardClasses} formNoValidate className="underline" type="submit">Add Class 1 to Class 10</button></p>}
      {scales.length > 1 && <label className="field">Grading<select className="input" name="grading_scale_id">{scales.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
      {scales.length === 1 && <input type="hidden" name="grading_scale_id" value={scales[0].id} />}
      <button className="btn self-start" type="submit">Make exam, then the date sheet</button>
    </form>
  );
}

type Exam = { id: string; name: string; kind: string; starts_on: string | null; ends_on: string | null; total_marks: number; weight_percent: number; status: string; created_at: string; exam_sections: { section_id: string }[] };

async function Steps({ exam, termId, step, base, today }: { exam: Exam; termId: string; step?: string; base: (o: Record<string, string | undefined>) => string; today: string }) {
  const supabase = await createClient();
  const secIds = exam.exam_sections.map((s) => s.section_id);
  const ids = secIds.length ? secIds : NONE;
  type Sec = { id: string; name: string; class_id: string; classes: { name: string; sort: number } };
  type P = { id: string; class_id: string; subject_id: string; paper_date: string; starts_at: string | null; ends_at: string | null; subjects: { name: string } };
  type SS = { section_id: string; subject_id: string; teacher_id: string | null; subjects: { name: string }; profiles: { full_name: string; phone: string | null } | null };
  type M = { subject_id: string; student_id: string; obtained: number | null; is_absent: boolean };
  type Kid = { id: string; full_name: string; section_id: string; family_id: string };
  const [{ data: secData }, { data: paperData }, { data: ssData }, marks, kids, { count: owing }] = await Promise.all([
    supabase.from("sections").select("id, name, class_id, classes(name, sort)").in("id", ids),
    supabase.from("exam_papers").select("id, class_id, subject_id, paper_date, starts_at, ends_at, subjects(name)").eq("exam_id", exam.id).order("paper_date"),
    supabase.from("section_subjects").select("section_id, subject_id, teacher_id, subjects(name), profiles(full_name, phone)").in("section_id", ids),
    fetchAll<M>((a, b) => supabase.from("marks").select("subject_id, student_id, obtained, is_absent").eq("exam_id", exam.id).order("id").range(a, b) as unknown as PromiseLike<{ data: M[] | null; error: unknown }>),
    fetchAll<Kid>((a, b) => supabase.from("students").select("id, full_name, section_id, family_id").eq("status", "enrolled").in("section_id", ids).order("id").range(a, b) as unknown as PromiseLike<{ data: Kid[] | null; error: unknown }>),
    supabase.from("family_balances").select("family_id", { count: "exact", head: true }).gt("balance_paisa", 0),
  ]);
  const { data: made } = await supabase.from("question_papers").select("id, class_id, subject_id").gte("created_at", exam.created_at);
  const secs = ((secData ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const papers = (paperData ?? []) as unknown as P[];
  const ss = (ssData ?? []) as unknown as SS[];
  const classes = [...new Map(secs.map((s) => [s.class_id, { id: s.class_id, name: s.classes.name }])).values()];

  // the subjects of each section: from its subject teachers, else from the date sheet of its class
  const subjOf = (s: Sec) => {
    const own = ss.filter((x) => x.section_id === s.id).map((x) => ({ id: x.subject_id, name: x.subjects.name, teacher: x.profiles?.full_name ?? null, teacherId: x.teacher_id, phone: x.profiles?.phone ?? null }));
    return own.length ? own : papers.filter((p) => p.class_id === s.class_id).map((p) => ({ id: p.subject_id, name: p.subjects.name, teacher: null, teacherId: null, phone: null }));
  };
  const size = new Map<string, number>();
  const secOfKid = new Map<string, string>();
  for (const k of kids) { size.set(k.section_id, (size.get(k.section_id) ?? 0) + 1); secOfKid.set(k.id, k.section_id); }
  const got = new Map<string, number>();
  for (const m of marks) { const k = `${secOfKid.get(m.student_id)}|${m.subject_id}`; got.set(k, (got.get(k) ?? 0) + 1); }
  const cells = secs.flatMap((s) => subjOf(s).map((sub) => ({ sec: s, sub, need: size.get(s.id) ?? 0, have: Math.min(size.get(s.id) ?? 0, got.get(`${s.id}|${sub.id}`) ?? 0) })));
  const need = cells.reduce((t, c) => t + c.need, 0);
  const have = cells.reduce((t, c) => t + c.have, 0);
  const marksDone = need ? have / need : 0;

  const done = {
    setup: true,
    sheet: papers.length > 0 && exam.status !== "draft",
    day: !!exam.ends_on && exam.ends_on < today,
    marks: need > 0 && marksDone >= 1,
    result: exam.status === "results",
  };
  const firstOpen = STEPS.find((s) => !done[s.id])?.id ?? "result";
  const current = STEPS.some((s) => s.id === step) ? step! : firstOpen;
  const late = exam.ends_on && exam.ends_on < today && marksDone < 1;
  const href = (s: string) => base({ exam: exam.id, step: s });
  const statusForm = (status: string, label: string, primary = true) => (
    <form action={setExamStatus}>
      <input type="hidden" name="exam_id" value={exam.id} /><input type="hidden" name="term_id" value={termId} /><input type="hidden" name="status" value={status} />
      <button className={primary ? "btn" : "btn-ghost"} type="submit">{label}</button>
    </form>
  );
  const hidden = <><input type="hidden" name="exam_id" value={exam.id} /><input type="hidden" name="term_id" value={termId} /></>;

  return (
    <section className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="h2">{exam.name}</h2>
          <p className="muted text-[13px]">{KIND[exam.kind]} · {classes.map((c) => c.name.replace("Class ", "")).join(", ") ? `Classes ${classes.map((c) => c.name.replace("Class ", "")).join(", ")}` : "No classes"} · {kids.length} students · out of {exam.total_marks} per paper · counts {Number(exam.weight_percent)}%</p>
        </div>
        <span className={`tagx ${STATUS[exam.status][1]}`}>{STATUS[exam.status][0]}</span>
      </div>

      <ol className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }} aria-label="Steps">
        {STEPS.map((s) => {
          const on = s.id === current; const ok = done[s.id];
          const sub = s.id === "sheet" ? (papers.length ? `${papers.length} papers` : "not made") : s.id === "day" ? (exam.starts_on ? `${shortDate(exam.starts_on)}${exam.ends_on ? ` – ${shortDate(exam.ends_on)}` : ""}` : "no dates")
            : s.id === "marks" ? (need ? pct(marksDone) : "—") : s.id === "result" ? (ok ? "published" : "not yet") : "done";
          return (
            <li key={s.id}>
              <Link href={href(s.id)} scroll={false} aria-current={on ? "step" : undefined}
                className="flex h-full items-center gap-2.5 rounded-[14px] border-2 p-2.5"
                style={on ? { borderColor: "#0284c7", background: "#f0f9ff", boxShadow: "0 3px 0 #7dd3fc" } : ok ? { borderColor: "#bbf7d0", background: "#f0fdf4" } : { borderColor: "#e5e7eb" }}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-black text-white" style={{ background: ok ? "#16a34a" : on ? "#0284c7" : "#cbd5e1" }}>{ok ? "✓" : s.n}</span>
                <span className="min-w-0"><span className="block text-[13px] leading-tight font-black">{s.label}</span><span className="muted block text-[11px]">{sub}</span></span>
              </Link>
            </li>
          );
        })}
      </ol>

      {current === "setup" && (
        <div className="flex flex-col gap-2">
          <p className="font-bold">The exam is made for {secs.length} sections. Next, make the date sheet.</p>
          <Link href={href("sheet")} className="btn self-start">Go to date sheet</Link>
        </div>
      )}

      {current === "sheet" && (
        <div className="flex flex-col gap-3">
          {papers.length > 0 ? <DateGrid papers={papers} classes={classes} /> : <Empty>No papers yet. Make the whole date sheet in one tap below.</Empty>}
          <form action={autoDateSheet} className="rounded-[14px] border-2 border-[#e0f2fe] bg-[#f8fcff] p-3">
            {hidden}
            <div className="font-black">{papers.length ? "Make it again automatically" : "Make the date sheet automatically"}</div>
            <p className="muted text-[12px]">One paper a day for every class, from each section&apos;s subjects. Sundays and holidays are skipped; the same subject falls on the same day where it can.{papers.length ? " This replaces the papers above." : ""}</p>
            <div className="mt-2 grid items-end gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
              <label className="field">First paper<input className="input" type="date" name="start" required defaultValue={exam.starts_on ?? addDays(today, 7)} /></label>
              <label className="field">Starts<input className="input" type="time" name="starts_at" defaultValue="08:30" /></label>
              <label className="field">Ends<input className="input" type="time" name="ends_at" defaultValue="11:00" /></label>
              <label className="field">Gap between papers<select className="input" name="gap"><option value="0">None</option><option value="1">1 day</option><option value="2">2 days</option></select></label>
              <label className="flex min-h-11 items-center gap-2 text-[13px] font-bold"><input type="checkbox" name="saturday" value="1" defaultChecked /> Saturday is a school day</label>
              <button className="btn" type="submit">{papers.length ? "Make again" : "Make date sheet"}</button>
            </div>
          </form>
          <details className="rounded-[14px] border-2 border-[#eef2f7] p-3">
            <summary className="cursor-pointer font-black">Add or move one paper</summary>
            <form action={addPaper} className="mt-2 grid items-end gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
              {hidden}
              <label className="field">Class<select className="input" name="class_id">{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="field">Subject<select className="input" name="subject_id">{[...new Map([...ss.map((x) => [x.subject_id, x.subjects.name] as const), ...papers.map((p) => [p.subject_id, p.subjects.name] as const)]).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
              <label className="field">Date<input className="input" type="date" name="paper_date" required /></label>
              <label className="field">Starts<input className="input" type="time" name="starts_at" defaultValue="08:30" /></label>
              <label className="field">Ends<input className="input" type="time" name="ends_at" defaultValue="11:00" /></label>
              <button className="btn-ghost" type="submit">Save paper</button>
            </form>
            <p className="muted mt-1 text-[12px]">Same class and subject again moves the paper to the new date.</p>
          </details>
          {papers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {exam.status === "draft" && statusForm("date_sheet", "Publish date sheet")}
              <Link href={`/print/date-sheet?exam=${exam.id}`} target="_blank" className="btn-ghost">Print date sheet</Link>
              <form action={sendDateSheet}>{hidden}<button className="btn-ghost" type="submit">Send to parents on WhatsApp</button></form>
            </div>
          )}
        </div>
      )}

      {current === "day" && (
        <div className="flex flex-col gap-3">
          <QuestionPapers papers={papers} made={made ?? []} classes={classes} examName={exam.name} />
          <p className="font-bold">{exam.starts_on && exam.starts_on > today ? `Exams start ${dayLabel(exam.starts_on)}. Print these a day before.` : "Everything for the exam hall."}</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {[["admit", "Admit cards", `Fee defaulters (${owing ?? 0} families) are held back`], ["admit&allow=1", "Admit cards for all", "Ignores fees"], ["slips", "Roll number slips", "For desks"], ["attendance", "Attendance sheets", "Students sign per paper"], ["labels", "Answer-sheet labels", "Name and roll no"]].map(([t, l, d]) => (
              <Link key={t} href={`/print/exam-day?exam=${exam.id}&type=${t}`} target="_blank" className="rounded-[14px] border-2 border-[#e5e7eb] p-3 hover:border-[#7dd3fc]">
                <div className="font-black">{l}</div><div className="muted text-[12px]">{d}</div>
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/principal/exams?tab=day" className="btn-ghost">Seating plan and invigilators</Link>
            {exam.status === "date_sheet" && statusForm("marks_entry", "Exams over: open marks entry")}
          </div>
        </div>
      )}

      {current === "marks" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">{need ? `${have} of ${need} marks in (${pct(marksDone)}).` : "No subjects for these sections yet."} Tap a box to type marks yourself.</p>
            {exam.status !== "marks_entry" && exam.status !== "results" && statusForm("marks_entry", "Open marks entry for teachers", false)}
          </div>
          {need > 0 && <MarksGrid cells={cells} examId={exam.id} />}
          {(() => {
            const lateT = [...new Map(cells.filter((c) => c.have < c.need && c.sub.teacherId).map((c) => [c.sub.teacherId!, c.sub])).values()];
            return lateT.length > 0 && (
              <form action={remindLateTeachers} className="rounded-[14px] border-2 border-[#fde68a] bg-[#fffbeb] p-3">
                {hidden}<input type="hidden" name="exam_name" value={exam.name} />
                <div className="font-black">{late ? "Late" : "Still to enter"}: {lateT.map((t) => t.teacher).join(", ")}</div>
                {lateT.map((t) => <input key={t.teacherId} type="hidden" name="teacher_id" value={t.teacherId!} />)}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn-ghost" style={sm} type="submit">Remind in the app</button>
                  {lateT.filter((t) => t.phone).map((t) => (
                    <a key={t.teacherId} className="btn-ghost" style={sm} target="_blank" rel="noreferrer"
                      href={`https://wa.me/${t.phone!.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(`Assalam o Alaikum ${t.teacher}, please enter your ${t.name} marks for ${exam.name} today.`)}`}>WhatsApp {t.teacher?.split(" ")[0]}</a>
                  ))}
                </div>
              </form>
            );
          })()}
          {exam.status === "marks_entry" && (
            <div className="flex flex-wrap items-center gap-2">
              {statusForm("results", marksDone >= 1 ? "Publish results" : `Publish anyway (${pct(marksDone)} in)`, marksDone >= 1)}
              <span className="muted text-[12px]">Publishing locks the marks and parents can see them.</span>
            </div>
          )}
        </div>
      )}

      {current === "result" && (exam.status !== "results" ? (
        <div className="flex flex-col gap-2">
          <p className="font-bold">{pct(marksDone)} of marks are in. Publish when ready; marks lock and parents see them.</p>
          <div className="flex flex-wrap gap-2">
            {statusForm("results", "Publish results")}
            <Link href={href("marks")} className="btn-ghost">See missing marks</Link>
          </div>
        </div>
      ) : (
        <ResultPanel exam={exam} secs={secs} kids={kids} marks={marks} hidden={hidden} />
      ))}
      <TimeSaved papers={papers.length} students={kids.length} sheets={need || kids.length * new Set(papers.map((p) => p.subject_id)).size} families={new Set(kids.map((k) => k.family_id)).size} />
    </section>
  );
}

// Dates down the side, classes across: the whole date sheet on one screen.
function DateGrid({ papers, classes }: { papers: { class_id: string; paper_date: string; starts_at: string | null; ends_at: string | null; subjects: { name: string } }[]; classes: { id: string; name: string }[] }) {
  const dates = [...new Set(papers.map((p) => p.paper_date))].sort();
  const at = new Map(papers.map((p) => [`${p.paper_date}|${p.class_id}`, p]));
  const cols = classes.filter((c) => papers.some((p) => p.class_id === c.id));
  const t = papers.find((p) => p.starts_at);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 4, minWidth: 110 + cols.length * 96 }}>
        <thead><tr><th className="text-left text-[12px]">{t ? `${time(t.starts_at)}–${time(t.ends_at)}` : ""}</th>{cols.map((c) => <th key={c.id} className="text-[12px] font-black">{c.name.replace("Class ", "")}</th>)}</tr></thead>
        <tbody>
          {dates.map((d) => (
            <tr key={d}>
              <td className="pr-2 text-[12px] font-black whitespace-nowrap">{dayLabel(d)}</td>
              {cols.map((c) => { const p = at.get(`${d}|${c.id}`);
                return <td key={c.id} className="rounded-lg p-1.5 text-center text-[12px] font-extrabold" style={p ? { background: "#e0f2fe", color: "#075985" } : { border: "2px dashed #eef2f7", color: "#cbd5e1" }}>{p ? p.subjects.name : "–"}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Sections down the side, subjects across; colour shows how many marks are in.
function MarksGrid({ cells, examId }: { cells: { sec: { id: string; name: string; classes: { name: string } }; sub: { id: string; name: string; teacher: string | null }; need: number; have: number }[]; examId: string }) {
  const subjects = [...new Map(cells.map((c) => [c.sub.id, c.sub.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const sections = [...new Map(cells.map((c) => [c.sec.id, c.sec])).values()];
  const at = new Map(cells.map((c) => [`${c.sec.id}|${c.sub.id}`, c]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 4, minWidth: 90 + subjects.length * 84 }}>
        <thead><tr><th /> {subjects.map(([id, n]) => <th key={id} className="text-[11px] font-black">{n}</th>)}</tr></thead>
        <tbody>
          {sections.map((s) => (
            <tr key={s.id}>
              <td className="pr-2 text-[12px] font-black whitespace-nowrap">{s.classes.name.replace("Class ", "")}-{s.name}</td>
              {subjects.map(([id]) => {
                const c = at.get(`${s.id}|${id}`);
                if (!c) return <td key={id} />;
                const r = c.need ? c.have / c.need : 0;
                const [bg, fg] = r >= 1 ? ["#dcfce7", "#15803d"] : r > 0 ? ["#fef3c7", "#92400e"] : ["#fee2e2", "#b91c1c"];
                return (
                  <td key={id} className="p-0">
                    <Link href={`/principal/exams/marks?exam=${examId}&section=${s.id}&subject=${id}`} title={c.sub.teacher ?? "No teacher"}
                      className="block rounded-lg p-1.5 text-center text-[12px] font-black" style={{ background: bg, color: fg }}>
                      {r >= 1 ? "✓" : `${c.have}/${c.need}`}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted mt-1 text-[11px]">Green: all in · Yellow: some · Red: none. Hover a box to see the teacher.</p>
    </div>
  );
}

async function ResultPanel({ exam, secs, kids, marks, hidden }: {
  exam: Exam; secs: { id: string; name: string; class_id: string; classes: { name: string; sort: number } }[];
  kids: { id: string; full_name: string; section_id: string }[]; marks: { subject_id: string; student_id: string; obtained: number | null; is_absent: boolean }[]; hidden: React.ReactNode;
}) {
  const per = new Map<string, { total: number; papers: number; fails: number }>();
  for (const m of marks) {
    const r = per.get(m.student_id) ?? { total: 0, papers: 0, fails: 0 };
    r.total += Number(m.obtained ?? 0); r.papers += 1; if (m.is_absent || Number(m.obtained ?? 0) < exam.total_marks * 0.33) r.fails += 1;
    per.set(m.student_id, r);
  }
  const sec = new Map(secs.map((s) => [s.id, s]));
  const withMarks = kids.filter((k) => per.has(k.id)).map((k) => ({ ...k, ...per.get(k.id)!, r: per.get(k.id)!.total / (exam.total_marks * per.get(k.id)!.papers) }));
  const classes = [...new Map(secs.map((s) => [s.class_id, s.classes.name])).entries()];
  const passed = withMarks.filter((k) => k.fails === 0).length;
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <div className="rounded-[14px] bg-[#f0fdf4] p-3"><div className="kick">Passed all papers</div><div className="text-[24px] font-black text-[#15803d]">{withMarks.length ? pct(passed / withMarks.length) : "—"}</div><div className="muted text-[12px]">{passed} of {withMarks.length}</div></div>
        <div className="rounded-[14px] bg-[#fef2f2] p-3"><div className="kick">Failed 1+ paper</div><div className="text-[24px] font-black text-[#b91c1c]">{withMarks.length - passed}</div><div className="muted text-[12px]">below 33% or absent</div></div>
        <div className="rounded-[14px] bg-[#eff6ff] p-3"><div className="kick">School average</div><div className="text-[24px] font-black text-[#1d4ed8]">{withMarks.length ? pct(withMarks.reduce((t, k) => t + k.r, 0) / withMarks.length) : "—"}</div></div>
      </div>
      <div>
        <div className="kick mb-1">Position holders</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {classes.map(([cid, cname]) => {
            const top = positions(withMarks.filter((k) => sec.get(k.section_id)?.class_id === cid)).filter((k) => k.pos <= 3);
            return (
              <div key={cid} className="rounded-[14px] border-2 border-[#fde68a] bg-[#fffdf5] p-3">
                <div className="font-black">{cname}</div>
                {top.length === 0 && <div className="muted text-[12px]">No marks.</div>}
                {top.map((k) => (
                  <div key={k.id} className="flex items-center gap-2 text-[13px]">
                    <span>{medal[k.pos - 1]}</span>
                    <Link href={`/principal/students/${k.id}`} className="min-w-0 flex-1 truncate font-bold">{k.full_name}</Link>
                    <span className="muted text-[11px]">{sec.get(k.section_id)?.name}</span>
                    <b className="tabular-nums">{pct(k.r)}</b>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={sendResults}>{hidden}<button className="btn" type="submit">Send each parent their child&apos;s result</button></form>
        <Link href={`/principal/exams?tab=results&exam=${exam.id}&view=student&show=low`} className="btn-ghost">Who needs help</Link>
        <Link href={`/principal/exams?tab=results&exam=${exam.id}`} className="btn-ghost">Full analysis</Link>
        <Link href="#report-cards" className="btn-ghost">Report cards</Link>
      </div>
    </div>
  );
}

// Each paper on the date sheet: is its question paper ready? One tap to make it with AI.
function QuestionPapers({ papers, made, classes, examName }: {
  papers: { class_id: string; subject_id: string; paper_date: string; subjects: { name: string } }[]; made: { id: string; class_id: string; subject_id: string }[];
  classes: { id: string; name: string }[]; examName: string;
}) {
  if (!papers.length) return null;
  const ready = new Map(made.map((m) => [`${m.class_id}|${m.subject_id}`, m.id]));
  const done = papers.filter((p) => ready.has(`${p.class_id}|${p.subject_id}`)).length;
  const cname = new Map(classes.map((c) => [c.id, c.name]));
  return (
    <div className="rounded-[14px] border-2 border-[#ddd6fe] bg-[#faf5ff] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-black">Question papers · {done} of {papers.length} ready</div>
        <span className="muted text-[12px]">✨ AI writes a board-style paper in about a minute; the teacher checks it.</span>
      </div>
      <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
        {papers.map((p) => {
          const id = ready.get(`${p.class_id}|${p.subject_id}`);
          const label = `${p.subjects.name} · ${(cname.get(p.class_id) ?? "").replace("Class ", "")}`;
          return id ? (
            <Link key={p.class_id + p.subject_id} href={`/teacher/paper-check/papers/${id}`} className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[13px] font-bold">
              <span className="text-[#16a34a]">✓</span><span className="flex-1 truncate">{label}</span><span className="muted text-[11px]">open</span>
            </Link>
          ) : (
            <Link key={p.class_id + p.subject_id} href={`/teacher/paper-check/papers?class=${p.class_id}&subject=${p.subject_id}&title=${encodeURIComponent(`${examName} · ${label}`)}`}
              className="flex items-center gap-2 rounded-xl border-2 border-dashed border-[#c4b5fd] bg-white px-2.5 py-2 text-[13px] font-bold">
              <span>✨</span><span className="flex-1 truncate">{label}</span><span className="text-[11px] text-[#6d28d9]">make</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// What this exam would take by hand vs. in Prinqo, worked out from its own numbers.
function TimeSaved(n: { papers: number; students: number; sheets: number; families: number }) {
  const t = timeSaved(n);
  if (!n.students) return null;
  return (
    <details className="rounded-[14px] border-2 border-[#bbf7d0] bg-[#f0fdf4] p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-[22px] font-black text-[#15803d]">⏱ {hours(t.saved)} saved</span>
          <span className="text-[13px] font-bold">By hand about {hours(t.hand)} · with Prinqo about {hours(t.app)}</span>
          <span className="muted text-[12px]">≈ {Math.round(t.saved / 60 / 6)} teacher-days · tap for details</span>
        </div>
      </summary>
      <div className="tbl mt-2 overflow-x-auto"><table className="w-full text-[13px]">
        <thead><tr><th className="text-left">Job</th><th className="text-left">How many</th><th className="text-right">By hand</th><th className="text-right">Prinqo</th><th className="text-right">Saved</th></tr></thead>
        <tbody>{t.rows.map((r) => (
          <tr key={r.id}>
            <td><b>{r.job}</b><div className="muted text-[11px]">{r.how}</div></td>
            <td className="tabular-nums">{r.qty} {r.unit}{r.qty === 1 || r.unit === "once" ? "" : "s"}</td>
            <td className="text-right tabular-nums">{hours(r.hand)}</td>
            <td className="text-right tabular-nums">{hours(r.app)}</td>
            <td className="text-right font-black text-[#15803d] tabular-nums">{hours(r.hand - r.app)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="muted mt-1 text-[11px]">An estimate from {n.papers} papers, {n.students} students and {n.families} families in this exam, with typical minutes for each job in a Pakistani school. Real time depends on your staff.</p>
    </details>
  );
}
