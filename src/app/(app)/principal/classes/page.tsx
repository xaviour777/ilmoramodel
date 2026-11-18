import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { ClassesTabs } from "@/components/classes-tabs";
import { PageHead, Chips, Empty, Row as Line } from "@/components/ilm";
import { ClassesOverview, GapsTab, MoveTab, PerformanceTab, PromotionTab, TimetableStatus } from "./views";
import { shortDate, time, todayPK } from "@/lib/format";
import {
  activateTiming, addPeriod, assignSubjectTeacher,
  createTimingProfile, deletePeriod, setSlot, autoFillSection, sendTimetableForReview, confirmTimetable,
} from "../actions";
import { WeekGrid } from "@/components/week-grid";
import { liveWeek, weekdayOf } from "@/lib/timetable";

type Search = { class?: string; f?: string; lv?: string; batch?: string; all?: string; q?: string; from?: string; sort?: string; tab?: string; profile?: string; section?: string; view?: string; teacher?: string; day?: string; saved?: string; error?: string };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ClassesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const tab = sp.tab ?? "classes";
  const supabase = await createClient();
  const { data: year } = await supabase.from("academic_sessions").select("name").eq("is_current", true).maybeSingle();
  return (
    <>
      <PageHead kick={`Academics${year?.name ? ` · Session ${year.name}` : ""}`} title="Classes and sections"
        sub="From Play group to BS. Set up classes, promote students, and watch how every class is doing.">
        <Link href="/principal/classes?tab=promote" className="btn-ghost">Promote students</Link>
        <Link href="/principal/classes#add-class" className="btn">Add class or program</Link>
      </PageHead>
      <ClassesTabs current={tab} />
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">{savedText(sp.saved)}</div>}
      {tab === "classes" && <ClassesOverview classId={sp.class} level={sp.lv} />}
      {tab === "promote" && <PromotionTab sectionId={sp.section} batch={sp.batch} all={sp.all === "1"} />}
      {tab === "move" && <MoveTab q={sp.q} fromSection={sp.from} />}
      {tab === "gaps" && <GapsTab />}
      {tab === "kpi" && <PerformanceTab sort={sp.sort} />}
      {tab === "timings" && <TimingsTab profileId={sp.profile} />}
      {tab === "timetable" && (sp.view || sp.section ? <TimetableViews sp={sp} /> : <><TimetableStatus /><TimetableViews sp={sp} /></>)}
    </>
  );
}

async function teachersList() {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name").in("role", ["teacher", "principal"]).eq("is_active", true).order("full_name");
  return data ?? [];
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
  if (v.startsWith("promoted-")) return `${v.slice(9)} students promoted. You can undo this for 7 days.`;
  if (v.startsWith("moved-")) return `${v.slice(6)} student${v.slice(6) === "1" ? "" : "s"} moved. Undo is under Recent moves.`;
  if (v.startsWith("undone-")) return `Undone for ${v.slice(7)} student${v.slice(7) === "1" ? "" : "s"}.`;
  if (v === "rules") return "Rules saved.";
  if (v === "program") return "Added. It shows as Not started until it has a section.";
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
