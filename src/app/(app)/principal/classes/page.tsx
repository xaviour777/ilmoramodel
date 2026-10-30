import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { Tabs } from "@/components/tabs";
import { time } from "@/lib/format";
import {
  activateTiming, addPeriod, addSection, addStandardClasses, assignSubjectTeacher, createClass, createSubject,
  createTimingProfile, deletePeriod, setClassTeacher, setSlot,
} from "../actions";

type Search = { tab?: string; profile?: string; section?: string; saved?: string; error?: string };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ClassesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const tab = sp.tab ?? "classes";
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Classes, timings and timetable</h1>
          <p className="muted text-base">Set up the school once a year. Teachers and parents see the changes straight away.</p>
        </div>
        <Tabs current={tab} tabs={[
          { id: "classes", label: "Classes", href: "/principal/classes" },
          { id: "timings", label: "Timings", href: "/principal/classes?tab=timings" },
          { id: "timetable", label: "Timetable", href: "/principal/classes?tab=timetable" },
        ]} />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {tab === "classes" && <ClassesTab />}
      {tab === "timings" && <TimingsTab profileId={sp.profile} />}
      {tab === "timetable" && <TimetableTab sectionId={sp.section} />}
    </>
  );
}

async function teachersList() {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name").in("role", ["teacher", "principal"]).eq("is_active", true).order("full_name");
  return data ?? [];
}

async function ClassesTab() {
  const supabase = await createClient();
  const [{ data: classes }, teachers, { data: counts }, { data: subjects }] = await Promise.all([
    supabase.from("classes").select("id, name, board, sort, sections(id, name, capacity, class_teacher_id)").order("sort"),
    teachersList(),
    supabase.from("students").select("section_id").eq("status", "enrolled"),
    supabase.from("subjects").select("id, name").order("name"),
  ]);
  const perSection = new Map<string, number>();
  for (const s of counts ?? []) perSection.set(s.section_id, (perSection.get(s.section_id) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
      <section className="card flex-[2]">
        <h2 className="h2">Classes and sections</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {(classes ?? []).map((c) => (
            <div key={c.id} className="flex flex-col gap-2.5 rounded-2xl border-2 p-3.5" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-baseline justify-between"><b className="text-lg font-black">{c.name}</b><span className="muted">{c.board}</span></div>
              {c.sections.sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                <form key={s.id} action={setClassTeacher} className="flex items-center gap-2">
                  <input type="hidden" name="section_id" value={s.id} />
                  <span className="pill pill-blue">{s.name}</span>
                  <span className="muted w-16 text-xs">{perSection.get(s.id) ?? 0}/{s.capacity}</span>
                  <select className="input min-h-10 flex-1 py-1 text-sm" name="teacher_id" defaultValue={s.class_teacher_id ?? ""} aria-label={`Class teacher for ${c.name}-${s.name}`}>
                    <option value="">No class teacher</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                  <button className="eyebrow px-1" type="submit">Save</button>
                </form>
              ))}
              <form action={addSection} className="flex items-center gap-2">
                <input type="hidden" name="class_id" value={c.id} />
                <input className="input min-h-10 w-20 py-1 text-sm" name="name" placeholder="C" required aria-label="New section name" />
                <input className="input min-h-10 w-20 py-1 text-sm" name="capacity" type="number" placeholder="40" aria-label="Seats" />
                <button className="eyebrow" type="submit">Add section</button>
              </form>
            </div>
          ))}
        </div>
      </section>
      <div className="flex flex-1 flex-col gap-5">
        <form action={addStandardClasses} className="card">
          <h2 className="h2">Class 1 to Class 10</h2>
          <p className="muted">Adds the classes from 1 to 10 that aren&apos;t here yet, each with section A. Classes you already have stay as they are.</p>
          <button className="btn-ghost" type="submit">Add Class 1 to 10</button>
        </form>
        <form action={createClass} className="card">
          <h2 className="h2">Add a class</h2>
          <label className="field">Class name<input className="input" name="name" required placeholder="Class 11 (FSc Pre-Medical)" /></label>
          <label className="field">Sections<input className="input" name="sections" placeholder="A, B" /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="field">Seats<input className="input" name="capacity" type="number" placeholder="40" /></label>
            <label className="field col-span-2">Board<input className="input" name="board" placeholder="BISE Lahore" /></label>
          </div>
          <label className="field">Order on lists<input className="input" name="sort" type="number" placeholder="11" /></label>
          <button className="btn" type="submit">Create class</button>
        </form>
        <form action={createSubject} className="card">
          <h2 className="h2">Subjects</h2>
          <div className="flex flex-wrap gap-1.5">{(subjects ?? []).map((s) => <span key={s.id} className="pill pill-gray">{s.name}</span>)}</div>
          <div className="flex gap-2"><input className="input" name="name" required placeholder="Computer Science" aria-label="New subject" /><button className="btn-ghost" type="submit">Add</button></div>
        </form>
      </div>
    </div>
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

  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
      <section className="card flex-[2]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="h2">Bell timings</h2>
          <Tabs current={profile?.id ?? ""} tabs={(profiles ?? []).map((p) => ({ id: p.id, label: p.name + (p.is_active ? " ✓" : ""), href: `/principal/classes?tab=timings&profile=${p.id}` }))} />
        </div>
        {profile && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="muted">{profile.active_from ? `${profile.active_from} to ${profile.active_to}` : "No dates set"} · {profile.is_active ? "in use now" : "not in use"}</span>
              {!profile.is_active && (
                <form action={activateTiming}><input type="hidden" name="timing_profile_id" value={profile.id} /><button className="btn-ghost" type="submit">Use these timings now</button></form>
              )}
            </div>
            {(periods ?? []).map((p) => (
              <form key={p.id} action={deletePeriod} className="row-box"
                style={p.kind === "break" ? { background: "var(--orange-soft)" } : p.kind === "assembly" ? { background: "var(--purple-soft)" } : undefined}>
                <input type="hidden" name="period_id" value={p.id} /><input type="hidden" name="timing_profile_id" value={profile.id} />
                <b className="w-28">{p.name}</b>
                <span className="flex-1 font-extrabold tabular-nums">{time(p.starts_at)} to {time(p.ends_at)}</span>
                <span className="muted">{mins(p.starts_at, p.ends_at)} min</span>
                <button className="muted px-2 underline" type="submit" aria-label={`Remove ${p.name}`}>Remove</button>
              </form>
            ))}
            <form action={addPeriod} className="grid grid-cols-2 items-end gap-2 md:grid-cols-6">
              <input type="hidden" name="timing_profile_id" value={profile.id} />
              <label className="field col-span-2">Name<input className="input" name="name" required placeholder="Period 9" /></label>
              <label className="field">Type<select className="input" name="kind"><option value="class">Class</option><option value="break">Break</option><option value="assembly">Assembly</option></select></label>
              <label className="field">Starts<input className="input" name="starts_at" type="time" required /></label>
              <label className="field">Ends<input className="input" name="ends_at" type="time" required /></label>
              <label className="field">Order<input className="input" name="sort" type="number" placeholder="90" /></label>
              <button className="btn col-span-2 md:col-span-6 md:justify-self-start" type="submit">Add period</button>
            </form>
          </>
        )}
      </section>
      <form action={createTimingProfile} className="card flex-1">
        <h2 className="h2">New timing</h2>
        <label className="field">Name<input className="input" name="name" required placeholder="Ramadan" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">From<input className="input" name="active_from" type="date" /></label>
          <label className="field">To<input className="input" name="active_to" type="date" /></label>
        </div>
        <button className="btn" type="submit">Create</button>
      </form>
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
  const palette = ["var(--blue-soft)", "var(--purple-soft)", "var(--orange-soft)", "var(--green-soft)", "var(--red-soft)", "#f2f2f2"];
  const color = new Map((subjects ?? []).map((s, i) => [s.id, palette[i % palette.length]]));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {list.map((s) => (
          <Link key={s.id} href={`/principal/classes?tab=timetable&section=${s.id}`}
            className="inline-flex min-h-10 items-center rounded-full border-2 px-3.5 text-sm font-extrabold"
            style={s.id === section.id ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)", color: "var(--blue-ink)" } : { borderColor: "var(--line)", background: "#fff" }}>
            {s.classes.name}-{s.name}
          </Link>
        ))}
      </div>
      <section className="card">
        <h2 className="h2">Weekly timetable · {section.classes.name}-{section.name}</h2>
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
