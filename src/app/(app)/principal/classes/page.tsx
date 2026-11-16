import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { ClassesTabs } from "@/components/classes-tabs";
import { PageHead, Stats, Stat, Chips, Insight, Empty, Bar, Row as Line } from "@/components/ilm";
import { pct } from "@/lib/format";
import { shortDate, time, todayPK } from "@/lib/format";
import {
  activateTiming, addPeriod, addSection, addStandardClasses, assignSubjectTeacher, createClass, createSubject, editClass, editSection,
  createTimingProfile, deletePeriod, setClassTeacher, setSlot, autoFillSection, sendTimetableForReview, confirmTimetable,
} from "../actions";
import { WeekGrid } from "@/components/week-grid";
import { liveWeek, weekdayOf } from "@/lib/timetable";

type Search = { class?: string; f?: string; tab?: string; profile?: string; section?: string; view?: string; teacher?: string; day?: string; saved?: string; error?: string };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ClassesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const tab = sp.tab ?? "classes";
  const supabase = await createClient();
  const { data: year } = await supabase.from("academic_sessions").select("name").eq("is_current", true).maybeSingle();
  return (
    <>
      <PageHead kick={`School${year?.name ? ` · Session ${year.name}` : ""}`} title="Classes and sections"
        sub="Each class at a glance: seats, attendance, results and fees. Click a class to manage it.">
        <Link href="/settings/year" className="btn-ghost">Promote to next session</Link>
        <Link href="/principal/classes#add-class" className="btn">Add class</Link>
      </PageHead>
      <ClassesTabs current={tab} />
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">{savedText(sp.saved)}</div>}
      {tab === "classes" && <ClassesTab classId={sp.class} filter={sp.f} />}
      {tab === "timings" && <TimingsTab profileId={sp.profile} />}
      {tab === "timetable" && <TimetableViews sp={sp} />}
    </>
  );
}

async function teachersList() {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name").in("role", ["teacher", "principal"]).eq("is_active", true).order("full_name");
  return data ?? [];
}

const STAGES = [
  { id: "all", label: "All classes", test: () => true },
  { id: "primary", label: "Primary", test: (n: number) => n <= 5 },
  { id: "middle", label: "Middle", test: (n: number) => n >= 6 && n <= 8 },
  { id: "matric", label: "Matric", test: (n: number) => n >= 9 && n <= 10 },
  { id: "college", label: "College", test: (n: number) => n >= 11 },
];

async function ClassesTab({ classId, filter }: { classId?: string; filter?: string }) {
  const supabase = await createClient();
  const today = todayPK();
  const since = new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [{ data: classes }, teachers, { data: counts }, { data: subjects }, { data: att }, { data: exam }, { data: invoices }, { data: secSubjects }, { data: slots }] = await Promise.all([
    supabase.from("classes").select("id, name, board, sort, sections(id, name, capacity, class_teacher_id)").order("sort"),
    teachersList(),
    supabase.from("students").select("section_id").eq("status", "enrolled"),
    supabase.from("subjects").select("id, name").order("name"),
    supabase.from("attendance_by_section_day").select("section_id, present, marked").gte("date", since),
    supabase.from("exams").select("id, name, total_marks").eq("status", "results").order("ends_on", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("invoices").select("invoice_lines(amount_paisa, students(section_id)), payments(amount_paisa)").eq("billing_month", monthStart),
    supabase.from("section_subjects").select("section_id, subject_id, subjects(name), profiles(full_name)"),
    supabase.from("timetable_slots").select("section_id, subject_id"),
  ]);
  const { data: marks } = exam
    ? await supabase.from("marks").select("obtained, students(section_id)").eq("exam_id", exam.id).eq("is_absent", false).not("obtained", "is", null)
    : { data: [] };

  const perSection = new Map<string, number>();
  for (const s of counts ?? []) perSection.set(s.section_id, (perSection.get(s.section_id) ?? 0) + 1);
  const attBy = new Map<string, { p: number; m: number }>();
  for (const a of att ?? []) { const c = attBy.get(a.section_id) ?? { p: 0, m: 0 }; c.p += a.present; c.m += a.marked; attBy.set(a.section_id, c); }
  const resBy = new Map<string, { sum: number; n: number }>();
  for (const m of (marks ?? []) as unknown as { obtained: number; students: { section_id: string } | null }[]) {
    const sid = m.students?.section_id; if (!sid) continue;
    const c = resBy.get(sid) ?? { sum: 0, n: 0 }; c.sum += Number(m.obtained) / (exam?.total_marks || 100); c.n++; resBy.set(sid, c);
  }
  const feeBy = new Map<string, { due: number; paid: number }>();
  for (const inv of (invoices ?? []) as unknown as { invoice_lines: { amount_paisa: number; students: { section_id: string } | null }[]; payments: { amount_paisa: number }[] }[]) {
    const due = inv.invoice_lines.reduce((t, l) => t + Number(l.amount_paisa), 0);
    const paid = Math.min(due, inv.payments.reduce((t, p) => t + Number(p.amount_paisa), 0));
    for (const l of inv.invoice_lines) {
      const sid = l.students?.section_id; if (!sid || due <= 0) continue;
      const c = feeBy.get(sid) ?? { due: 0, paid: 0 }; c.due += Number(l.amount_paisa); c.paid += paid * Number(l.amount_paisa) / due; feeBy.set(sid, c);
    }
  }
  const periodsBy = new Map<string, number>();
  for (const t of slots ?? []) periodsBy.set(`${t.section_id}-${t.subject_id}`, (periodsBy.get(`${t.section_id}-${t.subject_id}`) ?? 0) + 1);
  const teacherName = new Map(teachers.map((t) => [t.id, t.full_name]));

  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
  const ratio = (a: number, b: number) => (b ? a / b : null);
  const rows = (classes ?? []).map((c) => {
    const secs = [...c.sections].sort((a, b) => a.name.localeCompare(b.name));
    const ids = secs.map((s) => s.id);
    const students = sum(ids, (id) => perSection.get(id) ?? 0);
    const seats = sum(secs, (s) => s.capacity ?? 0);
    const a = ids.map((id) => attBy.get(id)).filter(Boolean) as { p: number; m: number }[];
    const r = ids.map((id) => resBy.get(id)).filter(Boolean) as { sum: number; n: number }[];
    const f = ids.map((id) => feeBy.get(id)).filter(Boolean) as { due: number; paid: number }[];
    const attRate = ratio(sum(a, (x) => x.p), sum(a, (x) => x.m));
    const result = ratio(sum(r, (x) => x.sum), sum(r, (x) => x.n));
    const feeDue = sum(f, (x) => x.due), feePaid = sum(f, (x) => x.paid);
    const noTeacher = secs.filter((s) => !s.class_teacher_id).length;
    const full = seats > 0 && students >= seats;
    const tag = !secs.length ? { t: "No sections", c: "y" } : noTeacher ? { t: "No teacher", c: "y" } : full ? { t: "Full", c: "r" }
      : result != null && result < 0.5 ? { t: "Low marks", c: "y" } : attRate != null && attRate < 0.85 ? { t: "Low attendance", c: "y" } : { t: "Good", c: "g" };
    return { ...c, secs, students, seats, attRate, result, feeRate: ratio(feePaid, feeDue), feeDue, feePaid, noTeacher, full, tag, attention: tag.c !== "g" };
  });
  const totalStudents = sum(rows, (r) => r.students), totalSeats = sum(rows, (r) => r.seats);
  const allAtt = [...attBy.values()], allRes = [...resBy.values()];
  const avgAtt = ratio(sum(allAtt, (x) => x.p), sum(allAtt, (x) => x.m));
  const avgRes = ratio(sum(allRes, (x) => x.sum), sum(allRes, (x) => x.n));
  const attention = rows.filter((r) => r.attention);
  const stage = filter === "attention" ? null : STAGES.find((s) => s.id === filter) ?? STAGES[0];
  const shown = stage ? rows.filter((r) => stage.test(r.sort)) : attention;
  const sel = rows.find((r) => r.id === classId) ?? shown[0] ?? rows[0];
  const href = (o: { f?: string; c?: string }) => `/principal/classes?${new URLSearchParams({ ...(o.f ?? filter ? { f: o.f ?? filter! } : {}), ...(o.c ? { class: o.c } : {}) })}`;

  const insight = sel && [
    sel.seats ? `${sel.students} of ${sel.seats} seats taken${sel.full ? ", the class is full" : ""}.` : "No seats set for this class.",
    sel.attRate != null ? `Attendance ${pct(sel.attRate)} over 30 days${avgAtt != null ? ` (school ${pct(avgAtt)})` : ""}.` : "No attendance marked in 30 days.",
    sel.result != null && exam ? `Average ${pct(sel.result)} in ${exam.name}.` : "",
    sel.feeRate != null ? `${pct(sel.feeRate)} of this month's fees paid.` : "",
    sel.noTeacher ? `${sel.noTeacher} section${sel.noTeacher === 1 ? " has" : "s have"} no class teacher.` : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <Stats>
        <Stat label="Students" value={totalStudents.toLocaleString("en-IN")} sub={`in ${sum(rows, (r) => r.secs.length)} sections · ${rows.length} classes`} />
        <Stat label="Seats free" value={totalSeats ? Math.max(0, totalSeats - totalStudents).toLocaleString("en-IN") : "—"}
          sub={totalSeats ? `${pct(Math.max(0, totalSeats - totalStudents) / totalSeats)} empty · ${rows.filter((r) => r.full).length} classes full` : "No seats set"} />
        <Stat label="Avg attendance" value={avgAtt != null ? pct(avgAtt) : "—"} sub="last 30 days" />
        <Stat label="Avg result" value={avgRes != null ? pct(avgRes) : "—"} sub={exam ? exam.name : "No published results yet"} />
        <Stat label="Need attention" value={attention.length} tone={attention.length ? "#92400e" : "#15803d"} warn={attention.length > 0}
          sub="no teacher · full · low marks" href={href({ f: "attention" })} />
      </Stats>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Chips label="Filter classes" current={filter ?? "all"} items={[...STAGES.map((s) => ({ id: s.id, label: s.label })), { id: "attention", label: `Needs attention (${attention.length})` }]
          .map((s) => ({ ...s, href: href({ f: s.id }) }))} />
        <Link href="/principal/classes?tab=timetable&view=school" className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }}>Whole-school timetable</Link>
      </div>

      <section className="flex flex-wrap items-start gap-5">
        <div className="grid min-w-0 flex-[3_1_520px] gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {shown.map((c) => (
            <Link key={c.id} href={href({ c: c.id })} scroll={false} aria-current={c.id === sel?.id ? "true" : undefined}
              className={`card flex flex-col gap-2.5 ${c.id === sel?.id ? "!border-[#7dd3fc] !bg-[#f0f9ff] !shadow-[0_4px_0_#7dd3fc]" : "hover:border-[#cbd5e1]"}`}>
              <div className="flex items-center justify-between gap-2"><span className="text-[16px] font-black">{c.name}</span><span className={`tagx ${c.tag.c}`}>{c.tag.t}</span></div>
              <div className="muted text-[12px]">{c.secs.length} section{c.secs.length === 1 ? "" : "s"}{c.board ? ` · ${c.board}` : ""}</div>
              <div><div className="mb-1 flex justify-between text-[12px] font-extrabold"><span>Seats</span><span className="tabular-nums">{c.students} / {c.seats || "—"}</span></div>
                <Bar value={c.seats ? c.students / c.seats : 0} color={c.full ? "#ef4444" : "#16a34a"} /></div>
              <div className="grid grid-cols-3 gap-1.5">
                {[["Attend.", c.attRate], ["Result", c.result], ["Fees", c.feeRate]].map(([l, v]) => (
                  <div key={l as string}><div className="kick" style={{ fontSize: 10 }}>{l as string}</div><div className="font-black tabular-nums">{v == null ? "—" : pct(v as number)}</div></div>
                ))}
              </div>
            </Link>
          ))}
          {shown.length === 0 && <div className="col-span-full"><Empty>{rows.length ? "No class matches this filter." : "No classes yet. Add Class 1 to 10 below, or add your own."}</Empty></div>}
        </div>

        {sel && (
          <aside className="card flex min-w-0 flex-[2_1_340px] flex-col gap-3.5" style={{ borderColor: "#1f2937", boxShadow: "0 4px 0 #1f2937" }}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="kick">Class detail</div><h2 className="mt-1 text-[24px] font-black">{sel.name}</h2>
                <div className="muted text-[13px]">{sel.board || "No board set"} · {sel.seats || "no"} seats</div></div>
              <span className={`tagx ${sel.tag.c}`}>{sel.tag.t}</span>
            </div>
            <Insight>{insight}</Insight>
            <div>
              <div className="kick mb-1">Sections and class teachers</div>
              {sel.secs.map((s) => (
                <form key={s.id} action={setClassTeacher}>
                  <Line>
                    <input type="hidden" name="section_id" value={s.id} />
                    <span className="tagx b">{s.name}</span>
                    <div className="min-w-[120px] flex-1">
                      <select className="input w-full" style={{ minHeight: 38 }} name="teacher_id" defaultValue={s.class_teacher_id ?? ""} aria-label={`Class teacher for ${sel.name}-${s.name}`}>
                        <option value="">No class teacher</option>
                        {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                      </select>
                      <div className="muted mt-0.5 text-[12px]">{perSection.get(s.id) ?? 0}/{s.capacity} students{attBy.get(s.id)?.m ? ` · ${pct(attBy.get(s.id)!.p / attBy.get(s.id)!.m)} attendance` : ""}</div>
                    </div>
                    <button className="btn-ghost" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }} type="submit">Save</button>
                    <Link href={`/principal/classes?tab=timetable&section=${s.id}`} className="text-[12px] font-black text-[#0369a1]">Timetable</Link>
                  </Line>
                </form>
              ))}
              {!sel.secs.length && <Empty>No sections yet.</Empty>}
            </div>
            <div>
              <div className="kick mb-1">Subject teachers</div>
              {sel.secs.flatMap((s) => ((secSubjects ?? []) as unknown as { section_id: string; subject_id: string; subjects: { name: string }; profiles: { full_name: string } | null }[])
                .filter((x) => x.section_id === s.id).map((x) => (
                  <Line key={s.id + x.subject_id} className="!py-1.5">
                    <span className="flex-1 text-[14px] font-bold">{x.subjects.name}{sel.secs.length > 1 ? ` · ${s.name}` : ""}</span>
                    <span className="text-[13px] font-black">{x.profiles?.full_name ?? "No teacher"}</span>
                    <span className="kick">{periodsBy.get(`${s.id}-${x.subject_id}`) ?? 0}/wk</span>
                  </Line>
                )))}
              {!(secSubjects ?? []).some((x) => sel.secs.some((s) => s.id === x.section_id)) && <p className="muted text-[13px]">No subject teachers yet. Assign them on the Timetable tab.</p>}
            </div>
            <form action={addSection} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="class_id" value={sel.id} />
              <input className="input w-20" style={{ minHeight: 38 }} name="name" placeholder="C" required aria-label="New section name" />
              <input className="input w-24" style={{ minHeight: 38 }} name="capacity" type="number" placeholder="Seats" aria-label="Seats" />
              <button className="btn-ghost flex-1" style={{ minHeight: 38, fontSize: 12 }} type="submit">Add section</button>
            </form>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/principal/students" className="btn-ghost" style={{ minHeight: 38, fontSize: 12 }}>Move students</Link>
              <Link href="/principal/notices" className="btn-ghost" style={{ minHeight: 38, fontSize: 12 }}>Message parents</Link>
              <Link href={`/principal/classes?tab=timetable&section=${sel.secs[0]?.id ?? ""}`} className="btn-ghost" style={{ minHeight: 38, fontSize: 12 }}>Timetable</Link>
              <Link href="/principal/exams" className="btn-ghost" style={{ minHeight: 38, fontSize: 12 }}>Class report</Link>
            </div>
            <details>
              <summary className="muted cursor-pointer text-[13px] font-extrabold underline">Rename or remove</summary>
              <div className="mt-2 flex flex-col gap-2">
                <form action={editClass} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="class_id" value={sel.id} />
                  <input className="input min-h-10 flex-1 py-1 text-sm" name="name" defaultValue={sel.name} required aria-label="Class name" />
                  <input className="input min-h-10 w-28 py-1 text-sm" name="board" defaultValue={sel.board ?? ""} placeholder="Board" aria-label="Board" />
                  <input className="input min-h-10 w-16 py-1 text-sm" name="sort" type="number" defaultValue={sel.sort} aria-label="Order on lists" />
                  <button className="eyebrow" type="submit">Save</button>
                  <button className="muted text-xs underline" type="submit" name="remove" value="1">Remove class</button>
                </form>
                {sel.secs.map((s) => (
                  <form key={s.id} action={editSection} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="section_id" value={s.id} />
                    <input className="input min-h-10 w-20 py-1 text-sm" name="name" defaultValue={s.name} required aria-label="Section name" />
                    <input className="input min-h-10 w-20 py-1 text-sm" name="capacity" type="number" defaultValue={s.capacity} aria-label="Seats" />
                    <button className="eyebrow" type="submit">Save</button>
                    <button className="muted text-xs underline" type="submit" name="remove" value="1">Remove {s.name}</button>
                  </form>
                ))}
                <p className="muted text-xs">A class or section can be removed only when no student is in it.</p>
              </div>
            </details>
          </aside>
        )}
      </section>

      <section id="add-class" className="flex scroll-mt-6 flex-wrap items-start gap-5">
        <form action={createClass} className="card flex min-w-0 flex-[2_1_360px] flex-col gap-3">
          <h2 className="h2">Add a class</h2>
          <label className="field">Class name<input className="input" name="name" required placeholder="Class 11 (FSc Pre-Medical)" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Sections<input className="input" name="sections" placeholder="A, B" /></label>
            <label className="field">Seats<input className="input" name="capacity" type="number" placeholder="40" /></label>
            <label className="field">Board<input className="input" name="board" placeholder="BISE Lahore" /></label>
            <label className="field">Order on lists<input className="input" name="sort" type="number" placeholder="11" /></label>
          </div>
          <button className="btn self-start" type="submit">Create class</button>
        </form>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <form action={addStandardClasses} className="card flex flex-col gap-2.5">
            <h2 className="h2">Class 1 to Class 10</h2>
            <p className="muted text-[14px]">Adds the classes from 1 to 10 that aren&apos;t here yet, each with section A. Classes you already have stay as they are.</p>
            <button className="btn-ghost self-start" type="submit">Add Class 1 to 10</button>
          </form>
          <form action={createSubject} className="card flex flex-col gap-2.5">
            <h2 className="h2">Subjects</h2>
            <div className="flex flex-wrap gap-1.5">{(subjects ?? []).map((s) => <span key={s.id} className="tagx">{s.name}</span>)}</div>
            <div className="flex gap-2"><input className="input" name="name" required placeholder="Computer Science" aria-label="New subject" /><button className="btn-ghost" type="submit">Add</button></div>
          </form>
        </div>
      </section>
      <p className="muted text-[12px]">{teacherName.size} teachers on staff · fees are this month&apos;s challans · results from the last published exam.</p>
    </>
  );
}

async function TimingsTab({ profileId }: { profileId?: string }) {
  const supabase = await createClient();
  const { data: profiles } = await supabase.from("timing_profiles").select("*").order("name");
  const profile = (profiles ?? []).find((p) => p.id === profileId) ?? (profiles ?? []).find((p) => p.is_active) ?? (profiles ?? [])[0];
  const { data: periods } = profile
    ? await supabase.from("periods").select("*").eq("timing_profile_id", profile.id).order("sort")
    : { data: [] };
  const mins = (a: string, b: string) => (Date.parse(`1970-01-01T${b}Z`) - Date.parse(`1970-01-01T${a}Z`)) / 60000;

  const classMins = (periods ?? []).filter((p) => p.kind === "class").map((p) => mins(p.starts_at, p.ends_at));
  return (
    <section className="flex flex-wrap items-start gap-5">
      <div className="card flex min-w-0 flex-[3_1_480px] flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="h2">Bell schedule</h2>
          <Chips label="Timing" current={profile?.id ?? ""} items={(profiles ?? []).map((p) => ({ id: p.id, label: p.name + (p.is_active ? " · in use" : ""), href: `/principal/classes?tab=timings&profile=${p.id}` }))} />
        </div>
        {!profile && <div className="mt-3"><Empty>No bell timings yet. Create one on the right.</Empty></div>}
        {profile && (
          <>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2.5">
              <span className="muted text-[13px]">{profile.active_from ? `${shortDate(profile.active_from)} to ${profile.active_to ? shortDate(profile.active_to) : "—"}` : "No dates set"} · {profile.is_active ? "in use now" : "not in use"}
                {classMins.length ? ` · ${classMins.length} periods` : ""}</span>
              {!profile.is_active && (
                <form action={activateTiming}><input type="hidden" name="timing_profile_id" value={profile.id} /><button className="btn" style={{ minHeight: 36, fontSize: 12 }} type="submit">Use these timings now</button></form>
              )}
            </div>
            <div className="mt-2">
              {(periods ?? []).map((p) => (
                <form key={p.id} action={deletePeriod}>
                  <Line className={p.kind === "break" ? "rounded-xl bg-[#fff7ed] px-2" : p.kind === "assembly" ? "rounded-xl bg-[#f5f3ff] px-2" : ""}>
                    <input type="hidden" name="period_id" value={p.id} /><input type="hidden" name="timing_profile_id" value={profile.id} />
                    <span className="w-32 font-black tabular-nums">{time(p.starts_at)} – {time(p.ends_at)}</span>
                    <span className={`flex-1 ${p.kind === "class" ? "font-bold" : "font-black"}`}>{p.name}</span>
                    <span className="kick">{mins(p.starts_at, p.ends_at)} min</span>
                    <button className="text-[12px] font-extrabold text-[#6b7280] underline" type="submit" aria-label={`Remove ${p.name}`}>Remove</button>
                  </Line>
                </form>
              ))}
              {(periods ?? []).length === 0 && <Empty>No periods in this timing yet.</Empty>}
            </div>
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-5">
        {profile && (
          <form action={addPeriod} className="card flex flex-col gap-3">
            <h2 className="h2">Change timings · add a period</h2>
            <input type="hidden" name="timing_profile_id" value={profile.id} />
            <label className="field">Name<input className="input" name="name" required placeholder="Period 9" /></label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="field">Type<select className="input" name="kind"><option value="class">Class</option><option value="break">Break</option><option value="assembly">Assembly</option></select></label>
              <label className="field">Order<input className="input" name="sort" type="number" placeholder="90" /></label>
              <label className="field">Starts<input className="input" name="starts_at" type="time" required /></label>
              <label className="field">Ends<input className="input" name="ends_at" type="time" required /></label>
            </div>
            <button className="btn" type="submit">Add period</button>
          </form>
        )}
        <form action={createTimingProfile} className="card flex flex-col gap-3">
          <h2 className="h2">New timing</h2>
          <label className="field">Name<input className="input" name="name" required placeholder="Ramadan" /></label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="field">From<input className="input" name="active_from" type="date" /></label>
            <label className="field">To<input className="input" name="active_to" type="date" /></label>
          </div>
          <button className="btn-ghost" type="submit">Create</button>
        </form>
      </div>
    </section>
  );
}

function savedText(v: string) {
  if (v.startsWith("filled-")) return `Filled ${v.slice(7)} free periods. Check them, then change any period below.`;
  return ({ full: "No free periods left to fill.", sent: "Sent. Each teacher sees it on their dashboard and can accept it or report a problem.",
    confirmed: "Confirmed. Parents and students now see the new timetable." } as Record<string, string>)[v] ?? "Saved.";
}

const VIEWS = [
  { id: "class", label: "By class" },
  { id: "teacher", label: "By teacher" },
  { id: "school", label: "Whole school" },
  { id: "review", label: "Send to teachers & confirm" },
];

async function TimetableViews({ sp }: { sp: Search }) {
  const view = VIEWS.some((v) => v.id === sp.view) ? sp.view! : "class";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link key={v.id} href={`/principal/classes?tab=timetable&view=${v.id}`}
            className="inline-flex min-h-10 items-center rounded-xl border-2 px-3.5 text-sm font-extrabold"
            style={v.id === view ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)", color: "var(--blue-ink)" } : { borderColor: "var(--line)", background: "#fff" }}>
            {v.label}
          </Link>
        ))}
      </div>
      {view === "class" && <TimetableTab sectionId={sp.section} />}
      {view === "teacher" && <TeacherWeek teacherId={sp.teacher} />}
      {view === "school" && <SchoolDay day={Number(sp.day) || 0} />}
      {view === "review" && <ReviewRound />}
    </div>
  );
}

async function TeacherWeek({ teacherId }: { teacherId?: string }) {
  const supabase = await createClient();
  const teachers = await teachersList();
  const t = teachers.find((x) => x.id === teacherId) ?? teachers[0];
  if (!t) return <div className="card"><p className="muted">Add teachers first.</p></div>;
  const cells = await liveWeek(supabase, { teacher: t.id });
  return (
    <section className="card">
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="timetable" /><input type="hidden" name="view" value="teacher" />
        <label className="field">Teacher<select className="input" name="teacher" defaultValue={t.id}>{teachers.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></label>
        <button className="btn-ghost" type="submit">Show</button>
      </form>
      <h2 className="h2">{t.full_name} · {cells.length} periods a week</h2>
      <WeekGrid cells={cells} show="section" today={weekdayOf(todayPK())} />
    </section>
  );
}

// Every section side by side for one day, so gaps and clashes are easy to spot.
async function SchoolDay({ day }: { day: number }) {
  const supabase = await createClient();
  const d = day >= 1 && day <= 6 ? day : Math.min(weekdayOf(todayPK()), 6);
  const [{ data: sections }, { data: periods }, { data: slots }] = await Promise.all([
    supabase.from("sections").select("id, name, classes(name, sort)"),
    supabase.from("periods").select("id, name, starts_at, sort, timing_profiles!inner(is_active)").eq("timing_profiles.is_active", true).eq("kind", "class").order("sort"),
    supabase.from("timetable_slots").select("section_id, period_id, subjects(name), profiles(full_name)").eq("weekday", d),
  ]);
  type Sec = { id: string; name: string; classes: { name: string; sort: number } };
  const list = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  type S = { section_id: string; period_id: string; subjects: { name: string } | null; profiles: { full_name: string } | null };
  const at = new Map(((slots ?? []) as unknown as S[]).map((s) => [`${s.section_id}-${s.period_id}`, s]));
  const free = list.length * (periods ?? []).length - (slots ?? []).length;
  return (
    <section className="card">
      <div className="flex flex-wrap gap-2">
        {DAYS.map((x, i) => (
          <Link key={x} href={`/principal/classes?tab=timetable&view=school&day=${i + 1}`} className={`pill ${i + 1 === d ? "pill-blue" : "pill-gray"}`}>{x}</Link>
        ))}
      </div>
      <h2 className="h2">Whole school · {DAYS[d - 1]} · {free > 0 ? `${free} free periods` : "every period filled"}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate text-[12px]" style={{ borderSpacing: 4 }}>
          <thead><tr><th className="muted text-left">Class</th>{(periods ?? []).map((p) => <th key={p.id} className="muted">{p.name}<div className="font-normal">{time(p.starts_at)}</div></th>)}</tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap font-black"><Link href={`/principal/classes?tab=timetable&section=${s.id}`}>{s.classes.name.replace("Class ", "")}-{s.name}</Link></td>
                {(periods ?? []).map((p) => {
                  const c = at.get(`${s.id}-${p.id}`);
                  return (
                    <td key={p.id} className="rounded-lg p-1 text-center font-extrabold" style={c ? { background: "var(--blue-soft)" } : { border: "2px dashed var(--line)", color: "var(--muted)" }}>
                      {c ? <>{c.subjects?.name}<div className="font-bold opacity-75">{c.profiles?.full_name?.split(" ")[0] ?? "No teacher"}</div></> : "Free"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function ReviewRound() {
  const supabase = await createClient();
  const { data: round } = await supabase.from("timetable_rounds").select("id, status, message, sent_at, confirmed_at")
    .neq("status", "replaced").order("sent_at", { ascending: false }).limit(1).maybeSingle();
  const { data: acks } = round
    ? await supabase.from("timetable_acks").select("teacher_id, status, note, responded_at, profiles(full_name)").eq("round_id", round.id)
    : { data: [] };
  type Ack = { teacher_id: string; status: string; note: string | null; responded_at: string | null; profiles: { full_name: string } | null };
  const list = ((acks ?? []) as unknown as Ack[]).sort((a, b) => (a.status === "issue" ? -1 : 0) - (b.status === "issue" ? -1 : 0) || (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? ""));
  const n = (st: string) => list.filter((a) => a.status === st).length;
  const reviewing = round?.status === "review";
  return (
    <div className="flex flex-col gap-5">
      <section className="card">
        <h2 className="h2">How it works</h2>
        <p className="muted">1. Set each class&apos;s week. 2. Send it to the teachers: each one sees their own periods and taps Accept or reports a problem. 3. Fix what they report, then Confirm. Parents and students only see the timetable after you confirm.</p>
        {round && (
          <div className={reviewing ? "notice-ok" : "muted"}>
            {reviewing
              ? `Sent ${shortDate(round.sent_at.slice(0, 10))}: ${n("accepted")} accepted, ${n("issue")} reported a problem, ${n("pending")} not answered yet.`
              : `Last confirmed ${shortDate((round.confirmed_at ?? round.sent_at).slice(0, 10))}.`}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <form action={sendTimetableForReview} className="flex flex-1 flex-wrap items-end gap-2">
            <label className="field flex-1">Note for teachers (optional)<input className="input" name="message" placeholder="e.g. Winter timing from Monday" /></label>
            <button className="btn-ghost" type="submit">{reviewing ? "Send again to all teachers" : "Send to teachers"}</button>
          </form>
          <form action={confirmTimetable}>
            <button className="btn" type="submit">Confirm and show to parents</button>
          </form>
        </div>
        {reviewing && n("pending") + n("issue") > 0 && <p className="muted">You can confirm before everyone answers; teachers who haven&apos;t answered still see their periods.</p>}
      </section>
      {list.length > 0 && (
        <section className="card">
          <h2 className="h2">Teachers&apos; answers</h2>
          {list.map((a) => (
            <div key={a.teacher_id} className="row-box">
              <span className={`pill ${a.status === "accepted" ? "pill-green" : a.status === "issue" ? "pill-red" : "pill-gray"}`}>
                {a.status === "accepted" ? "Accepted" : a.status === "issue" ? "Problem" : "Waiting"}
              </span>
              <div className="flex-1">
                <Link href={`/principal/classes?tab=timetable&view=teacher&teacher=${a.teacher_id}`} className="font-extrabold">{a.profiles?.full_name}</Link>
                {a.note && <div className="text-sm font-bold">{a.note}</div>}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

async function TimetableTab({ sectionId }: { sectionId?: string }) {
  const supabase = await createClient();
  const { data: sections } = await supabase.from("sections").select("id, name, classes(name, sort)");
  type Sec = { id: string; name: string; classes: { name: string; sort: number } };
  const list = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const section = list.find((s) => s.id === sectionId) ?? list[0];
  if (!section) return <div className="card"><p className="muted">Add a class first.</p></div>;
  const [{ data: periods }, { data: slots }, { data: subjects }, teachers, { data: subjectTeachers }] = await Promise.all([
    supabase.from("periods").select("id, name, starts_at, sort, timing_profiles!inner(is_active)").eq("timing_profiles.is_active", true).eq("kind", "class").order("sort"),
    supabase.from("timetable_slots").select("weekday, period_id, subject_id, teacher_id, subjects(name), profiles(full_name)").eq("section_id", section.id),
    supabase.from("subjects").select("id, name").order("name"),
    teachersList(),
    supabase.from("section_subjects").select("subject_id, teacher_id, subjects(name), profiles(full_name)").eq("section_id", section.id),
  ]);
  type Slot = { weekday: number; period_id: string; subject_id: string; teacher_id: string | null; subjects: { name: string }; profiles: { full_name: string } | null };
  const at = new Map(((slots ?? []) as unknown as Slot[]).map((s) => [`${s.weekday}-${s.period_id}`, s]));
  const workDays = new Set(((slots ?? []) as unknown as { weekday: number }[]).map((x) => x.weekday)).has(6) ? 6 : 5;
  const freeCount = Math.max(0, (periods ?? []).length * workDays - ((slots ?? []) as unknown as { weekday: number }[]).filter((x) => x.weekday <= workDays).length);
  const noTeacherCount = ((slots ?? []) as unknown as { teacher_id: string | null }[]).filter((x) => !x.teacher_id).length;
  const palette = ["var(--blue-soft)", "var(--purple-soft)", "var(--orange-soft)", "var(--green-soft)", "var(--red-soft)", "#f2f2f2"];
  const color = new Map((subjects ?? []).map((s, i) => [s.id, palette[i % palette.length]]));

  return (
    <div className="flex flex-col gap-5">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <form className="flex flex-wrap items-center gap-2.5">
            <input type="hidden" name="tab" value="timetable" />
            <h2 className="h2">Weekly timetable</h2>
            <select className="input" style={{ minHeight: 40 }} name="section" defaultValue={section.id} aria-label="Section">
              {list.map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}</option>)}
            </select>
            <button className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }} type="submit">Show</button>
            {freeCount > 0 ? <span className="tagx y">{freeCount} free period{freeCount === 1 ? "" : "s"}</span> : (periods ?? []).length > 0 && <span className="tagx g">Every period filled</span>}
            {noTeacherCount > 0 && <span className="tagx r">{noTeacherCount} without a teacher</span>}
          </form>
          <Link href="/principal/classes?tab=timetable&view=school" className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }}>Whole school</Link>
        </div>
        <p className="muted text-[13px]">Fill free periods fills the week from this section&apos;s subject teachers and never double-books a teacher.</p>
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] gap-1.5" style={{ gridTemplateColumns: `90px repeat(6, minmax(110px, 1fr))` }}>
            <div />
            {DAYS.map((d) => <div key={d} className="muted text-center">{d}</div>)}
            {(periods ?? []).map((p) => (
              <Row key={p.id} label={`${p.name} · ${time(p.starts_at)}`}>
                {DAYS.map((_, i) => {
                  const s = at.get(`${i + 1}-${p.id}`);
                  return (
                    <div key={i} className="min-h-12 rounded-xl p-2 text-center text-[13px] font-extrabold"
                      style={s ? { background: color.get(s.subject_id) } : { border: "2px dashed var(--line)", color: "var(--muted)" }}>
                      {s ? <>{s.subjects.name}<div className="text-[11px] font-bold opacity-75">{s.profiles?.full_name ?? "No teacher"}</div></> : "Free"}
                    </div>
                  );
                })}
              </Row>
            ))}
          </div>
        </div>
        <form action={setSlot} className="grid grid-cols-2 items-end gap-2 md:grid-cols-5">
          <input type="hidden" name="section_id" value={section.id} />
          <label className="field">Day<select className="input" name="weekday">{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
          <label className="field">Period<select className="input" name="period_id">{(periods ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="field">Subject<select className="input" name="subject_id"><option value="">Free period</option>{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="field">Teacher<select className="input" name="teacher_id"><option value="">None</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label>
          <button className="btn" type="submit">Set period</button>
        </form>
        <p className="muted">Ilmora stops you if a teacher is already booked in that period.</p>
        <form action={autoFillSection} className="flex flex-wrap items-center gap-3 rounded-xl p-3" style={{ background: "var(--page)" }}>
          <input type="hidden" name="section_id" value={section.id} />
          <div className="flex-1 text-sm font-bold">Fill the free periods from this section&apos;s subject teachers, without clashes. Periods you already set stay as they are.</div>
          <label className="flex items-center gap-1.5 text-sm font-bold"><input type="checkbox" name="saturday" /> Include Saturday</label>
          <button className="btn-ghost" type="submit">Fill free periods</button>
        </form>
      </section>
      <form action={assignSubjectTeacher} className="card">
        <input type="hidden" name="section_id" value={section.id} />
        <h2 className="h2">Subject teachers for this section</h2>
        <div className="flex flex-wrap gap-1.5">
          {((subjectTeachers ?? []) as unknown as { subject_id: string; subjects: { name: string }; profiles: { full_name: string } | null }[]).map((r) => (
            <span key={r.subject_id} className="pill pill-gray">{r.subjects.name}: {r.profiles?.full_name ?? "none"}</span>
          ))}
        </div>
        <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-3">
          <label className="field">Subject<select className="input" name="subject_id">{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="field">Teacher<select className="input" name="teacher_id"><option value="">None</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label>
          <button className="btn-ghost" type="submit">Assign</button>
        </div>
      </form>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (<><div className="muted self-center text-xs">{label}</div>{children}</>);
}
