import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { pct, shortDate, todayPK } from "@/lib/format";
import { Stats, Stat, Chips, Insight, Empty, Bar, Row } from "@/components/ilm";
import { addSection, editClass, editSection, setClassTeacher, addStandardClasses, createSubject } from "../actions";
import { addProgram, moveStudents, promoteSection, saveRules, setLevel, undoMoves } from "./actions";
import { LEVELS, PROGRAMS, classTitle, levelLabel, loadSchool, type School } from "./data";

const sm = { minHeight: 36, padding: "0 12px", fontSize: 12 } as const;
const tone = (v: number | null, good = 0.9, ok = 0.75) => (v == null ? "" : v >= good ? "g" : v >= ok ? "y" : "r");
const p = (v: number | null) => (v == null ? "—" : pct(v));

// ---------- gaps, shared by the Classes cards and the Gaps tab ----------
export async function computeGaps(s: School) {
  const supabase = await createClient();
  const out: { sev: "High" | "Medium" | "Low"; title: string; detail: string; fix: string; href: string; check: string }[] = [];
  const add = (check: string, sev: "High" | "Medium" | "Low", title: string, detail: string, fix: string, href: string) => out.push({ check, sev, title, detail, fix, href });
  const live = s.sections;
  for (const x of live.filter((x) => !x.class_teacher_id)) add("teacher", "Medium", `${classTitle(x.cls)}-${x.name} has no class teacher`, "Nobody is responsible for its attendance and parents.", "Assign teacher", `/principal/classes?sec=${x.id}&ws=over`);
  for (const x of live.filter((x) => x.capacity && x.students > x.capacity)) add("capacity", "High", `${classTitle(x.cls)}-${x.name} is over capacity`, `${x.students} students for ${x.capacity} seats.`, "Open a section", `/principal/classes?tab=classes&class=${x.cls.id}`);
  // subjects taught in a section with no teacher on record
  for (const ss of s.secSubjects.filter((q) => !q.teacher_id)) {
    const sec = live.find((x) => x.id === ss.section_id); const sub = s.subjects.find((q) => q.id === ss.subject_id);
    if (sec && sub) add("subject", "High", `${sub.name} in ${classTitle(sec.cls)}-${sec.name} has no teacher`, "Its periods and marks have nobody responsible.", "Assign teacher", `/principal/classes?tab=timetable&section=${sec.id}`);
  }
  for (const [tid, n] of s.periodsOf) if (n > s.rules.max_periods_week) add("load", "Medium", `${s.teacherName.get(tid) ?? "A teacher"} teaches ${n} periods a week`, `Above your limit of ${s.rules.max_periods_week}.`, "Rebalance", `/principal/classes?tab=timetable&view=teacher&teacher=${tid}`);
  const noTT = live.filter((x) => x.students > 0 && x.slots === 0);
  if (noTT.length) add("timetable", "Medium", `${noTT.length} section${noTT.length === 1 ? " has" : "s have"} no timetable`, noTT.slice(0, 8).map((x) => `${classTitle(x.cls)}-${x.name}`).join(", "), "Make timetable", `/principal/classes?tab=timetable&section=${noTT[0].id}`);
  // board forms: Class 9 and 10 students missing B-form, father's CNIC, photo, date of birth or group
  const boardSecs = live.filter((x) => x.cls.lvl === "matric").map((x) => x.id);
  if (boardSecs.length) {
    const { data } = await supabase.from("students").select("id, b_form, father_cnic, photo_url, date_of_birth, board_group").eq("status", "enrolled").in("section_id", boardSecs);
    const bad = (data ?? []).filter((x) => !x.b_form || !x.father_cnic || !x.photo_url || !x.date_of_birth || !x.board_group).length;
    if (bad) add("board", "Medium", `${bad} board form${bad === 1 ? " is" : "s are"} incomplete`, "Matric students missing B-form, father's CNIC, photo, date of birth or group.", "Open list", "/principal/students/board");
  }
  const hasTen = s.classes.some((c) => c.lvl === "matric" && c.sort === 10 && live.some((x) => x.class_id === c.id && x.students > 0));
  const hasEleven = s.classes.some((c) => c.lvl === "intermediate" && live.some((x) => x.class_id === c.id));
  if (hasTen && !hasEleven) add("path", "High", "No Class 11 after matric", "Class 10 students have nowhere to go in this school next year. Add FSc, ICS or FA.", "Add Class 11", "/principal/classes?tab=classes&lv=intermediate#programs");
  const order = { High: 0, Medium: 1, Low: 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]);
}

// ---------- 1. Classes ----------
export async function ClassesOverview({ classId, level }: { classId?: string; level?: string }) {
  const s = await loadSchool();
  const gaps = await computeGaps(s);
  const lv = LEVELS.some((l) => l.id === level) ? level! : "all";
  const groups = s.classes.map((c) => {
    const secs = s.sections.filter((x) => x.class_id === c.id);
    const students = secs.reduce((t, x) => t + x.students, 0), seats = secs.reduce((t, x) => t + (x.capacity ?? 0), 0);
    const w = (k: "att" | "result" | "fees") => { const v = secs.filter((x) => x[k] != null); const n = v.reduce((t, x) => t + x.students, 0); return v.length ? v.reduce((t, x) => t + x[k]! * (n ? x.students : 1), 0) / (n || v.length) : null; };
    const started = secs.length > 0;
    const tag = !started ? ["Not started", ""] : seats && students >= seats ? ["Full", "r"] : (w("result") ?? 1) < 0.5 ? ["Low marks", "y"] : c.lvl === "matric" && c.sort === 10 ? ["Board year", "b"] : ["Good", "g"];
    return { c, secs, students, seats, att: w("att"), result: w("result"), fees: w("fees"), started, tag };
  });
  const shown = groups.filter((g) => lv === "all" || g.c.lvl === lv);
  const sel = groups.find((g) => g.c.id === classId) ?? shown[0];
  const total = s.sections.reduce((t, x) => t + x.students, 0), seats = s.sections.reduce((t, x) => t + (x.capacity ?? 0), 0);
  const teachers = s.staff.filter((t) => t.role === "teacher").length;
  const notStarted = groups.filter((g) => !g.started).length;
  const offered = new Set(s.classes.map((c) => c.program).filter(Boolean));
  const ideas = PROGRAMS.filter((x) => !offered.has(x.program));
  const href = (o: { lv?: string; class?: string }) => "/principal/classes?" + new URLSearchParams(Object.entries({ tab: "classes", lv: lv === "all" ? undefined : lv, ...o }).filter(([, v]) => v) as [string, string][]);
  const insight = sel && [
    sel.started ? `${sel.students} of ${sel.seats || "—"} seats taken in ${sel.secs.length} section${sel.secs.length === 1 ? "" : "s"}.` : "Not started yet: add a section to open admissions.",
    sel.att != null ? `Attendance ${pct(sel.att)} this session.` : "",
    sel.result != null ? `Average result ${pct(sel.result)}.` : "",
    sel.fees != null ? `${pct(sel.fees)} of fees collected.` : "",
    gaps.filter((g) => g.title.includes(sel.c.name)).length ? `${gaps.filter((g) => g.title.includes(sel.c.name)).length} gap(s) to fix.` : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <Stats>
        <Stat label="Students" value={total.toLocaleString("en-IN")} sub={`in ${s.sections.length} sections`} />
        <Stat label="Seats used" value={seats ? pct(total / seats) : "—"} sub={`${total} of ${seats} seats`} />
        <Stat label="Students per teacher" value={teachers ? Math.round(total / teachers) : "—"} sub={`${teachers} teachers · goal 30 or less`} tone={teachers && total / teachers > 30 ? "#c2410c" : undefined} />
        <Stat label="Programs offered" value={groups.length} sub={notStarted ? `${notStarted} not started yet` : "all running"} />
        <Stat label="Gaps to fix" value={gaps.length} tone={gaps.length ? "#c2410c" : "#15803d"} warn={gaps.length > 0} sub="see Gaps and checks" href="/principal/classes?tab=gaps" />
      </Stats>
      <Chips label="Level" current={lv} items={[{ id: "all", label: "All" }, ...LEVELS.map((l) => ({ id: l.id, label: l.label }))].map((x) => ({ ...x, href: href({ lv: x.id === "all" ? undefined : x.id }) }))} />
      <section className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[3_1_520px]">
          {LEVELS.filter((l) => shown.some((g) => g.c.lvl === l.id)).map((l) => (
            <div key={l.id} className="mb-4">
              <div className="kick mb-2">{l.label}</div>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {shown.filter((g) => g.c.lvl === l.id).map((g) => (
                  <Link key={g.c.id} href={href({ class: g.c.id })} scroll={false} aria-current={g.c.id === sel?.c.id ? "true" : undefined}
                    className={`card flex flex-col gap-2 ${!g.started ? "!border-dashed !bg-[#f8fafc] !shadow-none" : ""} ${g.c.id === sel?.c.id ? "!border-[#7dd3fc] !bg-[#f0f9ff] !shadow-[0_4px_0_#7dd3fc]" : ""}`}>
                    <div className="flex items-center justify-between gap-2"><span className="font-black">{classTitle(g.c)}</span><span className={`tagx ${g.tag[1]}`}>{g.tag[0]}</span></div>
                    <div className="muted text-[12px]">{g.started ? `${g.secs.length} section${g.secs.length === 1 ? "" : "s"} · ${g.students}/${g.seats || "—"}` : "Not started"}{g.c.board ? ` · ${g.c.board}` : ""}</div>
                    <Bar value={g.seats ? g.students / g.seats : 0} color={g.seats && g.students >= g.seats ? "#ef4444" : "#16a34a"} />
                    <div className="flex justify-between text-[12px] font-extrabold text-[#4b5563]"><span>Att. {p(g.att)}</span><span>Result {p(g.result)}</span><span>Fees {p(g.fees)}</span></div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {shown.length === 0 && <Empty>No class at this level yet. Add one below.</Empty>}
        </div>

        {sel && (
          <aside className="card flex min-w-0 flex-[2_1_340px] flex-col gap-3.5" style={{ borderColor: "#1f2937", boxShadow: "0 4px 0 #1f2937" }}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="kick">{levelLabel(sel.c.lvl)}</div><h2 className="mt-1 text-[22px] font-black">{classTitle(sel.c)}</h2>
                <div className="muted text-[13px]">{sel.c.board || "No board set"} · {sel.seats || "no"} seats</div></div>
              <span className={`tagx ${sel.tag[1]}`}>{sel.tag[0]}</span>
            </div>
            <Insight>{insight}</Insight>
            <div>
              <div className="kick mb-1">Sections and class teachers</div>
              {sel.secs.map((x) => (
                <form key={x.id} action={setClassTeacher}>
                  <Row>
                    <input type="hidden" name="section_id" value={x.id} />
                    <span className="tagx b">{x.name}</span>
                    <div className="min-w-[120px] flex-1">
                      <select className="input w-full" style={{ minHeight: 38 }} name="teacher_id" defaultValue={x.class_teacher_id ?? ""} aria-label={`Class teacher for ${x.name}`}>
                        <option value="">No class teacher</option>{s.staff.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                      </select>
                      <div className="muted mt-0.5 text-[12px]">{x.students}/{x.capacity ?? "—"} students{x.att != null ? ` · ${pct(x.att)} attendance` : ""}</div>
                    </div>
                    <button className="btn-ghost" style={sm} type="submit">Save</button>
                  </Row>
                </form>
              ))}
              {!sel.secs.length && <Empty>No sections yet, so this {sel.c.program ? "program" : "class"} hasn&apos;t started.</Empty>}
            </div>
            <form action={addSection} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="class_id" value={sel.c.id} />
              <input className="input w-20" style={{ minHeight: 38 }} name="name" placeholder="A" required aria-label="New section name" />
              <input className="input w-24" style={{ minHeight: 38 }} name="capacity" type="number" placeholder="Seats" aria-label="Seats" />
              <button className="btn-ghost flex-1" style={sm} type="submit">Add section</button>
            </form>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/principal/classes?tab=move" className="btn-ghost" style={sm}>Move students</Link>
              <Link href={`/principal/classes?tab=promote${sel.secs[0] ? `&section=${sel.secs[0].id}` : ""}`} className="btn-ghost" style={sm}>Promote class</Link>
              <Link href="/principal/classes?tab=kpi" className="btn-ghost" style={sm}>Performance</Link>
              <Link href={`/principal/classes?tab=timetable${sel.secs[0] ? `&section=${sel.secs[0].id}` : ""}`} className="btn-ghost" style={sm}>Timetable</Link>
            </div>
            <details>
              <summary className="muted cursor-pointer text-[13px] font-extrabold underline">Level, rename or remove</summary>
              <div className="mt-2 flex flex-col gap-2">
                <form action={setLevel} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="class_id" value={sel.c.id} />
                  <select className="input" style={{ minHeight: 38 }} name="level" defaultValue={sel.c.lvl} aria-label="Level">{LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
                  <input className="input flex-1" style={{ minHeight: 38 }} name="program" defaultValue={sel.c.program ?? ""} placeholder="Group / program (e.g. ICS)" aria-label="Group or program" />
                  <button className="eyebrow" type="submit">Save</button>
                </form>
                <form action={editClass} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="class_id" value={sel.c.id} />
                  <input className="input min-h-10 flex-1 py-1 text-sm" name="name" defaultValue={sel.c.name} required aria-label="Class name" />
                  <input className="input min-h-10 w-28 py-1 text-sm" name="board" defaultValue={sel.c.board ?? ""} placeholder="Board" aria-label="Board" />
                  <input className="input min-h-10 w-16 py-1 text-sm" name="sort" type="number" defaultValue={sel.c.sort} aria-label="Order on lists" />
                  <button className="eyebrow" type="submit">Save</button>
                  <button className="muted text-xs underline" type="submit" name="remove" value="1">Remove</button>
                </form>
                {sel.secs.map((x) => (
                  <form key={x.id} action={editSection} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="section_id" value={x.id} />
                    <input className="input min-h-10 w-20 py-1 text-sm" name="name" defaultValue={x.name} required aria-label="Section name" />
                    <input className="input min-h-10 w-20 py-1 text-sm" name="capacity" type="number" defaultValue={x.capacity ?? ""} aria-label="Seats" />
                    <button className="eyebrow" type="submit">Save</button>
                    <button className="muted text-xs underline" type="submit" name="remove" value="1">Remove {x.name}</button>
                  </form>
                ))}
              </div>
            </details>
          </aside>
        )}
      </section>

      <section id="programs" className="flex scroll-mt-6 flex-wrap items-start gap-5">
        <form id="add-class" action={addProgram} className="card flex min-w-0 flex-[3_1_480px] scroll-mt-6 flex-col gap-3">
          <h2 className="h2">Add a class or program</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">Name<input className="input" name="name" required placeholder="Class 11, Play group, BS" /></label>
            <label className="field">Level<select className="input" name="level" defaultValue="intermediate">{LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
            <label className="field">Group / program<input className="input" name="program" list="programs" placeholder="FSc Pre-Medical, ICS, BS Computer Science" />
              <datalist id="programs">{PROGRAMS.map((x) => <option key={x.program} value={x.program} />)}</datalist></label>
            <label className="field">Board / affiliation<input className="input" name="board" placeholder="BISE Lahore" /></label>
            <label className="field">Sections (empty = not started)<input className="input" name="sections" placeholder="A, B" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">Seats<input className="input" name="capacity" type="number" placeholder="40" /></label>
              <label className="field">Order<input className="input" name="sort" type="number" placeholder="11" /></label>
            </div>
          </div>
          <button className="btn self-start" type="submit">Add</button>
        </form>
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
          <div className="card">
            <h2 className="h2">Programs you could offer</h2>
            <p className="muted text-[13px]">Added as &ldquo;Not started&rdquo;; add a section when admissions open.</p>
            {ideas.map((x) => (
              <form key={x.program} action={addProgram}>
                <Row>
                  {(["name", "program", "level", "board", "sort"] as const).map((k) => <input key={k} type="hidden" name={k} value={String(x[k])} />)}
                  <span className="flex-1 font-bold">{x.name} · {x.program}<span className="muted block text-[12px]">{levelLabel(x.level)} · {x.board}</span></span>
                  <button className="btn-ghost" style={sm} type="submit">Add</button>
                </Row>
              </form>
            ))}
            {ideas.length === 0 && <Empty>All common programs are added.</Empty>}
          </div>
          <form action={createSubject} className="card flex flex-col gap-2.5">
            <h2 className="h2">Subjects</h2>
            <div className="flex flex-wrap gap-1.5">{s.subjects.map((x) => <span key={x.id} className="tagx">{x.name}</span>)}</div>
            <div className="flex gap-2"><input className="input" name="name" required placeholder="Computer Science" aria-label="New subject" /><button className="btn-ghost" type="submit">Add</button></div>
          </form>
          <form action={addStandardClasses} className="card flex flex-col gap-2.5">
            <h2 className="h2">Class 1 to Class 10</h2>
            <p className="muted text-[14px]">Adds the classes from 1 to 10 that aren&apos;t here yet, each with section A.</p>
            <button className="btn-ghost self-start" type="submit">Add Class 1 to 10</button>
          </form>
        </div>
      </section>
    </>
  );
}

// ---------- 2. Promotion ----------
export async function PromotionTab({ sectionId, batch, all }: { sectionId?: string; batch?: string; all?: boolean }) {
  const s = await loadSchool();
  const supabase = await createClient();
  const live = s.sections.filter((x) => x.students > 0);
  const sec = s.sections.find((x) => x.id === sectionId) ?? live[0];
  if (!sec) return <Empty>No students in any section yet.</Empty>;
  // next class: the next class up by order; Class 10 goes to Class 11 (pick a group)
  const nextSort = [...new Set(s.classes.map((c) => c.sort))].sort((a, b) => a - b).find((n) => n > sec.cls.sort);
  const toMatric = sec.cls.lvl === "matric" && sec.cls.sort === 10;
  const programs = s.classes.filter((c) => c.lvl === "intermediate" && c.program && s.sections.some((x) => x.class_id === c.id));
  const notStartedPrograms = s.classes.filter((c) => c.lvl === "intermediate" && c.program && !s.sections.some((x) => x.class_id === c.id));
  const targets = s.sections.filter((x) => x.cls.sort === nextSort && (!toMatric || x.cls.lvl !== "intermediate"));
  const defaultTarget = targets.find((x) => x.name === sec.name) ?? targets[0];
  const [{ data: kids }, finals] = await Promise.all([
    supabase.from("students").select("id, full_name, roll_no").eq("section_id", sec.id).eq("status", "enrolled").order("roll_no").order("full_name"),
    supabase.from("exams").select("id, name, total_marks, kind, terms!inner(academic_sessions!inner(is_current))").eq("status", "results").in("kind", ["final", "sendup"]).eq("terms.academic_sessions.is_current", true),
  ]);
  const ids = (kids ?? []).map((k) => k.id);
  const annual = finals.data ?? [];
  const tm = new Map(annual.map((e) => [e.id, e.total_marks || 100]));
  const [marks, att] = await Promise.all([
    tm.size && ids.length ? fetchAll<{ student_id: string; obtained: number; exam_id: string; subjects: { name: string } }>((f, t) => supabase.from("marks").select("student_id, obtained, exam_id, subjects(name)").in("exam_id", [...tm.keys()]).in("student_id", ids).eq("is_absent", false).not("obtained", "is", null).order("id").range(f, t) as unknown as PromiseLike<{ data: { student_id: string; obtained: number; exam_id: string; subjects: { name: string } }[] | null; error: unknown }>) : Promise.resolve([]),
    ids.length ? fetchAll<{ student_id: string; status: string }>((f, t) => supabase.from("attendance").select("student_id, status").in("student_id", ids).gte("date", s.year?.starts_on ?? "1900-01-01").order("id").range(f, t) as unknown as PromiseLike<{ data: { student_id: string; status: string }[] | null; error: unknown }>) : Promise.resolve([]),
  ]);
  const R = s.rules;
  const rows = (kids ?? []).map((k) => {
    const subj = new Map<string, number[]>();
    for (const m of marks.filter((m) => m.student_id === k.id)) subj.set(m.subjects.name, [...(subj.get(m.subjects.name) ?? []), Number(m.obtained) / (tm.get(m.exam_id) ?? 100)]);
    const avgs = [...subj.entries()].map(([n, v]) => ({ n, r: v.reduce((a, b) => a + b, 0) / v.length }));
    const failed = avgs.filter((x) => x.r * 100 < R.pass_mark).map((x) => x.n);
    const overall = avgs.length ? avgs.reduce((t, x) => t + x.r, 0) / avgs.length : null;
    const a = att.filter((x) => x.student_id === k.id);
    const ar = a.length ? a.filter((x) => x.status === "present" || x.status === "late").length / a.length : null;
    const lowAtt = ar != null && ar * 100 < R.promote_min_attendance;
    const suggest = overall == null ? "promote" : failed.length >= 2 || lowAtt ? "detain" : failed.length === 1 ? "conditional" : "promote";
    const why = [overall != null ? pct(overall) : "no annual result", failed.length ? `failed ${failed.join(", ")}` : "", ar != null ? `attendance ${pct(ar)}` : ""].filter(Boolean).join(" · ");
    return { ...k, overall, failed, ar, suggest, why };
  });
  const count = (k: string) => rows.filter((r) => r.suggest === k).length;
  const { data: recent } = await supabase.from("student_moves").select("batch_id, created_at, kind, undone_at").eq("from_section_id", sec.id).in("kind", ["promote", "conditional", "detain", "leave", "pass_out"]).order("created_at", { ascending: false }).limit(200);
  const batches = [...new Map((recent ?? []).filter((r) => !r.undone_at).map((r) => [r.batch_id, r])).values()].slice(0, 3);
  const week = Date.now() - 7 * 864e5;
  const DEC = [["promote", "Promote", "p"], ["conditional", "Conditional", "l"], ["detain", "Detain", "a"], ["pass_out", "Passed out", "v"], ["leave", "Leaving", "v"]] as const;
  // the last class has nowhere to go: the default there is "Passed out"
  const pick = (sug: string) => { const v = all ? "promote" : sug; return !defaultTarget && (!toMatric || programs.length === 0) && (v === "promote" || v === "conditional") ? "pass_out" : v; };

  return (
    <>
      <section className="card flex flex-row flex-wrap gap-3">
        {[["1 · Results", annual.length ? `${annual.map((e) => e.name).join(", ")} published` : "No annual result published yet", annual.length > 0],
          ["2 · Decide", "Promote, conditional, detain or leaving", true], ["3 · Place", "New class, section and rolls", true], ["4 · Confirm", "Fees stay, parents told", true]].map(([l, t, ok]) => (
          <div key={l as string} className={`min-w-[160px] flex-1 rounded-[14px] border-2 p-3 ${ok ? "border-[#e5e7eb]" : "border-[#fcd34d] bg-[#fffbeb]"}`}><div className="kick">{l as string}</div><div className="font-black">{t as string}</div></div>
        ))}
      </section>
      <form className="flex flex-wrap items-end gap-2.5">
        <input type="hidden" name="tab" value="promote" />
        <label className="field">Promote from<select className="input" name="section" defaultValue={sec.id}>{live.map((x) => <option key={x.id} value={x.id}>{classTitle(x.cls)}-{x.name} ({x.students})</option>)}</select></label>
        <button className="btn-ghost" type="submit">Open</button>
      </form>
      {batches.length > 0 && (
        <div className="card flex flex-col gap-1">
          <div className="kick">Recent promotions from this section</div>
          {batches.map((b) => (
            <form key={b.batch_id} action={undoMoves}><Row>
              <input type="hidden" name="batch_id" value={b.batch_id} /><input type="hidden" name="back" value={`/principal/classes?tab=promote&section=${sec.id}`} />
              <span className="flex-1 font-bold">{new Date(b.created_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{batch === b.batch_id ? " · just now" : ""}</span>
              {Date.parse(b.created_at) > week ? <button className="btn-ghost" style={sm} type="submit">Undo</button> : <span className="tagx">Locked</span>}
            </Row></form>
          ))}
        </div>
      )}
      <form action={promoteSection} className="flex flex-wrap items-start gap-5">
        <input type="hidden" name="section_id" value={sec.id} />
        <div className="card min-w-0 flex-[3_1_520px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">{classTitle(sec.cls)}-{sec.name} → {toMatric ? "Class 11 (choose group)" : defaultTarget ? classTitle(defaultTarget.cls) : "no next class"}</h2>
            {all ? <Link href={`/principal/classes?tab=promote&section=${sec.id}`} className="btn-ghost" style={sm}>Use suggestion</Link>
              : <Link href={`/principal/classes?tab=promote&section=${sec.id}&all=1`} className="btn-ghost" style={sm}>Promote whole class</Link>}
          </div>
          <p className="muted text-[13px]">Suggestion uses your rules: pass mark {R.pass_mark}% in every subject, attendance {R.promote_min_attendance}%+. One failed subject = conditional (supplementary exam); two or more, or low attendance = detain.</p>
          {toMatric && programs.length === 0 && <div className="notice-warn mt-2 text-[14px]">No Class 11 group has a section yet{notStartedPrograms.length ? ` (${notStartedPrograms.map((c) => c.program).join(", ")} not started)` : ""}. Add one on the Classes tab first.</div>}
          {rows.map((r) => (
            <Row key={r.id}>
              <input type="hidden" name="student_id" value={r.id} /><input type="hidden" name={`score:${r.id}`} value={r.overall ?? 0} /><input type="hidden" name={`name:${r.id}`} value={r.full_name} />
              <div className="min-w-[160px] flex-1"><div className="font-black">{r.roll_no ? `${r.roll_no}. ` : ""}{r.full_name}</div><div className={`text-[12px] font-bold ${r.failed.length ? "text-[#b91c1c]" : "text-[#6b7280]"}`}>{r.why}</div></div>
              {toMatric && (
                <select className="input" style={{ minHeight: 36 }} name={`prog:${r.id}`} defaultValue={programs[0]?.program ?? ""} aria-label={`Class 11 group for ${r.full_name}`}>
                  {programs.map((c) => <option key={c.id} value={c.program!}>{c.program}</option>)}
                </select>
              )}
              <div className="flex gap-1" role="radiogroup" aria-label={`Decision for ${r.full_name}`}>
                {DEC.map(([v, l, c]) => (
                  <label key={v} className={`seg ${c}`}><input type="radio" name={`dec:${r.id}`} value={v} defaultChecked={pick(r.suggest) === v} /><span className="px-2 text-[12px]">{l}</span></label>
                ))}
              </div>
            </Row>
          ))}
          {rows.length === 0 && <Empty>No students in this section.</Empty>}
        </div>
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
          <div className="card">
            <h2 className="h2">Suggested</h2>
            <Row><span className="flex-1 font-bold">Promote</span><span className="tagx g">{count("promote")}</span></Row>
            <Row><span className="flex-1 font-bold">Conditional</span><span className="tagx y">{count("conditional")}</span></Row>
            <Row><span className="flex-1 font-bold">Detain (repeat class)</span><span className="tagx r">{count("detain")}</span></Row>
            <p className="muted mt-1 text-[12px]">Change any choice on the left before confirming.</p>
          </div>
          <div className="card flex flex-col gap-3">
            <h2 className="h2">Place them</h2>
            {!toMatric && (
              <label className="field">Move promoted students to
                <select className="input" name="target" defaultValue={defaultTarget?.id ?? ""}>
                  {!targets.length && <option value="">No next class yet</option>}
                  {targets.map((x) => <option key={x.id} value={x.id}>{classTitle(x.cls)}-{x.name} ({x.students}/{x.capacity ?? "—"})</option>)}
                </select>
              </label>
            )}
            {toMatric && <p className="muted text-[13px]">Each student goes to the first section of the group chosen on the left.</p>}
            <label className="field">Roll numbers<select className="input" name="rolls" defaultValue="keep"><option value="keep">Keep the same number</option><option value="merit">Renumber by result</option><option value="name">Renumber by name</option></select></label>
            <label className="field">From date<input className="input" type="date" name="effective_on" defaultValue={todayPK()} /></label>
            <p className="rounded-[12px] bg-[#f8fafc] p-2.5 text-[13px] font-bold text-[#4b5563]">Unpaid fees stay on each family&apos;s account and carry forward. Attendance, marks and report cards stay on each student&apos;s record.</p>
            <label className="flex items-center gap-2.5 text-[14px] font-extrabold"><input type="checkbox" name="notify" defaultChecked className="h-5 w-5" /> Tell parents in the app</label>
            <label className="flex items-center gap-2.5 text-[14px] font-extrabold"><input type="checkbox" name="phones" className="h-5 w-5" /> Also on WhatsApp / SMS</label>
            <button className="btn" type="submit" disabled={!rows.length}>Confirm promotion</button>
            <p className="muted text-[12px]">You can undo for 7 days.</p>
          </div>
        </div>
      </form>
    </>
  );
}

// ---------- 3. Move a student ----------
export async function MoveTab({ q, fromSection }: { q?: string; fromSection?: string }) {
  const s = await loadSchool();
  const supabase = await createClient();
  const term = (q ?? "").replace(/[%,()]/g, "").trim();
  let query = supabase.from("students").select("id, full_name, roll_no, section_id").eq("status", "enrolled").order("full_name").limit(60);
  if (fromSection) query = query.eq("section_id", fromSection);
  if (term) query = query.or(`full_name.ilike.%${term}%,roll_no.ilike.%${term}%,admission_no.ilike.%${term}%`);
  const [{ data: found }, { data: moves }] = await Promise.all([
    term || fromSection ? query : Promise.resolve({ data: [] as { id: string; full_name: string; roll_no: string | null; section_id: string | null }[] }),
    supabase.from("student_moves").select("id, batch_id, created_at, kind, reason, effective_on, undone_at, from_section_id, to_section_id, students(full_name)").eq("kind", "move").order("created_at", { ascending: false }).limit(40),
  ]);
  const secName = new Map(s.sections.map((x) => [x.id, `${classTitle(x.cls)}-${x.name}`]));
  const week = Date.now() - 7 * 864e5;
  type M = { id: string; batch_id: string; created_at: string; reason: string | null; effective_on: string; undone_at: string | null; from_section_id: string | null; to_section_id: string | null; students: { full_name: string } | null };
  const byBatch = [...((moves ?? []) as unknown as M[]).reduce((m, r) => m.set(r.batch_id, [...(m.get(r.batch_id) ?? []), r]), new Map<string, M[]>()).values()];
  const REASONS = ["Parent request", "Balancing sections", "Change of group (e.g. Biology to Computer)", "Mid-year promotion", "Repeat the class", "Discipline", "Other"];
  return (
    <section className="flex flex-wrap items-start gap-5">
      <div className="card flex min-w-0 flex-[3_1_520px] flex-col gap-3">
        <h2 className="h2">Move one student or a group</h2>
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="move" />
          <label className="field flex-[1_1_200px]">Find students<input className="input" name="q" defaultValue={q} placeholder="Name, roll or admission no." /></label>
          <label className="field">or a whole section<select className="input" name="from" defaultValue={fromSection ?? ""}><option value="">—</option>{s.sections.map((x) => <option key={x.id} value={x.id}>{secName.get(x.id)} ({x.students})</option>)}</select></label>
          <button className="btn-ghost" type="submit">Show</button>
        </form>
        {(term || fromSection) ? (
          <form action={moveStudents} className="flex flex-col gap-3">
            <div className="max-h-[360px] overflow-y-auto rounded-[14px] border-2 border-[#eef2f7] px-2">
              {(found ?? []).map((k) => (
                <label key={k.id} className="flex items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2 first:border-t-0">
                  <input type="checkbox" name="student_id" value={k.id} defaultChecked={(found ?? []).length === 1} className="h-5 w-5" />
                  <span className="flex-1 font-black">{k.full_name}</span><span className="muted text-[12px]">{k.section_id ? secName.get(k.section_id) : "no class"}{k.roll_no ? ` · Roll ${k.roll_no}` : ""}</span>
                </label>
              ))}
              {(found ?? []).length === 0 && <div className="py-3"><Empty>No student matches.</Empty></div>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field">Move to section<select className="input" name="to_section_id" required defaultValue="">
                <option value="" disabled>Choose</option>
                {s.sections.map((x) => <option key={x.id} value={x.id}>{secName.get(x.id)} ({x.students}/{x.capacity ?? "—"}{x.capacity && x.students >= x.capacity ? ", full" : ""})</option>)}
              </select></label>
              <label className="field">Reason<select className="input" name="reason">{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
              <label className="field">From date<input className="input" type="date" name="effective_on" defaultValue={todayPK()} /></label>
              <label className="field">Note for the record<input className="input" name="note" placeholder="Optional" /></label>
            </div>
            <div className="rounded-[14px] border-2 border-[#e5e7eb] bg-[#f8fafc] p-3"><div className="font-black">What moves with them</div>
              <div className="muted text-[13px]">Attendance, marks and fee history stay with each student. Subject teachers and timetable switch to the new section.</div></div>
            <button className="btn self-start" type="submit">Move students</button>
          </form>
        ) : <Empty>Search for a student, or pick a section to move several at once.</Empty>}
      </div>
      <div className="card min-w-0 flex-[2_1_320px]">
        <h2 className="h2">Recent moves</h2>
        {byBatch.length === 0 && <div className="mt-2"><Empty>No moves yet.</Empty></div>}
        {byBatch.slice(0, 12).map((b) => {
          const r = b[0]; const undone = b.every((x) => x.undone_at);
          return (
            <form key={r.batch_id} action={undoMoves}>
              <Row>
                <input type="hidden" name="batch_id" value={r.batch_id} />
                <div className="min-w-0 flex-1"><div className="font-black">{b.length === 1 ? r.students?.full_name : `${b.length} students`}</div>
                  <div className="muted text-[12px]">{r.from_section_id ? secName.get(r.from_section_id) : "—"} → {r.to_section_id ? secName.get(r.to_section_id) : "—"}{r.reason ? ` · ${r.reason}` : ""} · {shortDate(r.effective_on)}</div></div>
                {undone ? <span className="tagx">Undone</span> : Date.parse(r.created_at) > week ? <button className="btn-ghost" style={sm} type="submit">Undo</button> : <span className="tagx">Locked</span>}
              </Row>
            </form>
          );
        })}
      </div>
    </section>
  );
}

// ---------- 4. Gaps and checks ----------
export async function GapsTab() {
  const s = await loadSchool();
  const gaps = await computeGaps(s);
  const CHECKS = [["teacher", "Section with no class teacher"], ["subject", "Subject with no teacher"], ["capacity", "Section over capacity"], ["load", `Teacher over ${s.rules.max_periods_week} periods a week`],
    ["timetable", "Section without a timetable"], ["board", "Board form details missing"], ["path", "No Class 11 after Class 10"]];
  const SEV = { High: ["r", "#ef4444"], Medium: ["y", "#f59e0b"], Low: ["b", "#0ea5e9"] } as const;
  const tenth = s.sections.filter((x) => x.cls.lvl === "matric" && x.cls.sort === 10).reduce((t, x) => t + x.students, 0);
  const top = gaps[0];
  return (
    <section className="flex flex-wrap items-start gap-5">
      <div className="card min-w-0 flex-[3_1_520px]">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Gaps and checks</h2><span className="muted text-[13px]">Worked out each time you open this page</span></div>
        {gaps.length === 0 && <div className="mt-2"><Empty>Nothing to fix. Every check passes.</Empty></div>}
        {gaps.map((g, i) => (
          <Row key={i}>
            <span className="h-10 w-1.5 flex-none rounded-full" style={{ background: SEV[g.sev][1] }} />
            <div className="min-w-[180px] flex-1"><div className="font-black">{g.title}</div><div className="muted text-[12px]">{g.detail}</div></div>
            <span className={`tagx ${SEV[g.sev][0]}`}>{g.sev}</span>
            <Link href={g.href} className="btn-ghost" style={sm}>{g.fix}</Link>
          </Row>
        ))}
      </div>
      <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
        {top && (
          <Insight title="Biggest win">
            {top.check === "path" ? `Opening Class 11 would give your ${tenth} Class 10 students a place to continue in this school next year.` : `${top.title}. ${top.detail}`}
          </Insight>
        )}
        <div className="card">
          <h2 className="h2">Checks Prinqo runs</h2>
          {CHECKS.map(([id, l]) => { const n = gaps.filter((g) => g.check === id).length; return (
            <Row key={id}><span className="flex-1 font-bold">{l}</span><span className={`tagx ${n ? (id === "capacity" || id === "subject" || id === "path" ? "r" : "y") : "g"}`}>{n ? n : "OK"}</span></Row>
          ); })}
        </div>
        <form action={saveRules} className="card flex flex-col gap-2.5">
          <input type="hidden" name="back" value="/principal/classes?tab=gaps" />
          <h2 className="h2">Limits</h2>
          <label className="field">Most periods a teacher should take in a week<input className="input" type="number" name="max_periods_week" defaultValue={s.rules.max_periods_week} min={1} max={60} /></label>
          <button className="btn-ghost self-start" type="submit">Save</button>
        </form>
      </div>
    </section>
  );
}

// ---------- 5. Performance ----------
export async function PerformanceTab({ sort }: { sort?: string }) {
  const s = await loadSchool();
  const supabase = await createClient();
  const { count: left } = await supabase.from("students").select("id", { count: "exact", head: true }).neq("status", "enrolled").gte("created_at", s.year?.starts_on ?? "1900-01-01");
  const rows = s.sections.filter((x) => x.students > 0).map((x) => ({ ...x, score: s.score(x), ratio: x.teachers ? Math.round(x.students / x.teachers) : null }));
  const key = ["score", "att", "result", "fees", "class"].includes(sort ?? "") ? sort! : "score";
  const val = (r: (typeof rows)[number]) => key === "score" ? r.score : key === "att" ? r.att : key === "result" ? r.result : key === "fees" ? r.fees : null;
  if (key !== "class") rows.sort((a, b) => (val(b) ?? -1) - (val(a) ?? -1));
  const avgW = (k: "att" | "pass" | "fees" | "homework") => { const v = rows.filter((r) => r[k] != null); const n = v.reduce((t, r) => t + r.students, 0); return n ? v.reduce((t, r) => t + r[k]! * r.students, 0) / n : null; };
  const total = rows.reduce((t, r) => t + r.students, 0);
  const R = s.rules;
  return (
    <>
      <Stats>
        <Stat label="Pass rate" value={p(avgW("pass"))} tone="#15803d" sub={s.examCount ? `pass mark ${R.pass_mark}% · published results` : "no published results yet"} />
        <Stat label="Attendance" value={p(avgW("att"))} sub="this session" />
        <Stat label="Fee collection" value={p(avgW("fees"))} sub="this session's challans" />
        <Stat label="Homework done" value={p(avgW("homework"))} sub="submitted, this session" />
        <Stat label="Students kept" value={total ? pct(total / (total + (left ?? 0))) : "—"} sub={`${left ?? 0} left this session`} />
      </Stats>
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Class performance</h2>
          <Chips label="Sort" current={key} items={[["score", "Overall"], ["att", "Attendance"], ["result", "Results"], ["fees", "Fees"], ["class", "By class"]].map(([id, label]) => ({ id, label, href: `/principal/classes?tab=kpi&sort=${id}` }))} /></div>
        {rows.length === 0 ? <div className="mt-2"><Empty>No students in any section yet.</Empty></div> : (
          <div className="tbl mt-2 overflow-x-auto"><table className="w-full min-w-[900px]">
            <thead><tr>{["Section", "Class teacher", "Seats", "Attendance", "Avg result", "Pass", "Fees", "Homework", "Per teacher", "Overall"].map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/principal/classes?sec=${r.id}`} className="font-black text-[#0369a1]">{classTitle(r.cls)}-{r.name}</Link></td>
                <td className="text-[13px]">{r.class_teacher_id ? s.teacherName.get(r.class_teacher_id) ?? "—" : <span className="text-[#b91c1c]">none</span>}</td>
                <td className="tabular-nums">{r.students}/{r.capacity ?? "—"}</td>
                <td className="tabular-nums">{p(r.att)}</td><td className="tabular-nums">{p(r.result)}</td><td className="tabular-nums">{p(r.pass)}</td>
                <td className="tabular-nums">{p(r.fees)}</td><td className="tabular-nums">{p(r.homework)}</td><td className="tabular-nums">{r.ratio ?? "—"}</td>
                <td>{r.score == null ? <span className="tagx">—</span> : <span className={`tagx ${tone(r.score / 100, 0.85, 0.75)}`}>{r.score}</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <form action={saveRules} className="mt-3 flex flex-wrap items-end gap-2.5">
          <input type="hidden" name="back" value="/principal/classes?tab=kpi" />
          <span className="muted w-full text-[13px]">Overall score = weighted average of the numbers a section has. Weights:</span>
          {([["weight_attendance", "Attendance"], ["weight_results", "Results"], ["weight_fees", "Fees"], ["weight_homework", "Homework"]] as const).map(([k, l]) => (
            <label key={k} className="field w-28">{l} %<input className="input" type="number" min={0} max={100} name={k} defaultValue={R[k]} /></label>
          ))}
          <label className="field w-28">Pass mark %<input className="input" type="number" min={1} max={100} name="pass_mark" defaultValue={R.pass_mark} /></label>
          <label className="field w-36">Promote if attendance %<input className="input" type="number" min={0} max={100} name="promote_min_attendance" defaultValue={R.promote_min_attendance} /></label>
          <button className="btn-ghost" type="submit">Save rules</button>
        </form>
      </section>
    </>
  );
}

// ---------- 6. Timetable status (the full timetable opens below) ----------
export async function TimetableStatus() {
  const s = await loadSchool();
  const supabase = await createClient();
  const { data: timing } = await supabase.from("timing_profiles").select("name, active_from").eq("is_active", true).maybeSingle();
  const live = s.sections.filter((x) => x.students > 0);
  const withTT = live.filter((x) => x.slots > 0).length;
  const over = [...s.periodsOf.values()].filter((n) => n > s.rules.max_periods_week).length;
  return (
    <section className="flex flex-wrap items-start gap-5">
      <div className="card min-w-0 flex-[3_1_480px]">
        <h2 className="h2">Timetable and bell timings</h2>
        <p className="muted text-[13px]">Weekly timetable for every section, filled from each section&apos;s subject teachers without clashes, and bell timings for summer, winter or Ramadan.</p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <Link href="/principal/classes?tab=timetable&view=class" className="btn">Open timetable</Link>
          <Link href="/principal/classes?tab=timetable&view=school" className="btn-ghost">Whole school</Link>
          <Link href="/principal/classes?tab=timings" className="btn-ghost">Bell timings</Link>
          <Link href="/principal/students/board" className="btn-ghost">Board registration</Link>
        </div>
      </div>
      <div className="card min-w-0 flex-[2_1_320px]">
        <h2 className="h2">Status</h2>
        <Row><span className="flex-1 font-bold">Sections with a timetable</span><span className="font-black">{withTT} of {live.length}</span></Row>
        <Row><span className="flex-1 font-bold">Teachers over {s.rules.max_periods_week} periods</span><span className={`tagx ${over ? "y" : "g"}`}>{over || "None"}</span></Row>
        <Row><span className="flex-1 font-bold">Current timing</span><span className="font-black">{timing ? `${timing.name}${timing.active_from ? ` · from ${shortDate(timing.active_from)}` : ""}` : "not set"}</span></Row>
      </div>
    </section>
  );
}
