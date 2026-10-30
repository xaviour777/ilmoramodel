import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { mySections } from "@/lib/teacher";
import { SectionPicker } from "@/components/section-picker";
import { Icon } from "@/components/icons";
import { shortDate, time, todayPK } from "@/lib/format";
import { saveAttendance } from "./actions";

type Search = { section?: string; date?: string; saved?: string; error?: string; alerts?: string };

const STATUS = [
  { v: "present", k: "p", label: "P", name: "Present" },
  { v: "absent", k: "a", label: "A", name: "Absent" },
  { v: "late", k: "l", label: "L", name: "Late" },
  { v: "leave", k: "v", label: "LV", name: "On leave" },
] as const;

export default async function TeacherAttendance({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const sections = await mySections(me.id);
  const date = sp.date ?? todayPK();
  const section = sections.find((s) => s.id === sp.section) ?? sections[0];
  const supabase = await createClient();

  const weekday = ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1; // 1 = Monday
  const [{ data: students }, { data: marks }, { data: slots }] = await Promise.all([
    section
      ? supabase.from("students").select("id, full_name, roll_no").eq("section_id", section.id).eq("status", "enrolled").order("roll_no")
      : Promise.resolve({ data: [] as { id: string; full_name: string; roll_no: string }[] }),
    section
      ? supabase.from("attendance").select("student_id, status").eq("section_id", section.id).eq("date", date)
      : Promise.resolve({ data: [] as { student_id: string; status: string }[] }),
    supabase.from("timetable_slots")
      .select("id, periods!inner(name, starts_at, ends_at, sort, timing_profiles!inner(is_active)), subjects(name), sections(name, classes(name))")
      .eq("teacher_id", me.id).eq("weekday", weekday).eq("periods.timing_profiles.is_active", true),
  ]);

  const mark = new Map((marks ?? []).map((m) => [m.student_id, m.status as string]));
  const already = (marks ?? []).length > 0;
  const counts = { present: 0, absent: 0, late: 0, leave: 0 } as Record<string, number>;
  for (const s of students ?? []) counts[mark.get(s.id) ?? "present"]++;

  type Slot = { id: string; periods: { name: string; starts_at: string; ends_at: string; sort: number }; subjects: { name: string } | null; sections: { name: string; classes: { name: string } } | null };
  const today = ((slots ?? []) as unknown as Slot[]).sort((a, b) => a.periods.sort - b.periods.sort);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Assalam-o-Alaikum, {me.full_name.split(" ")[0]}</h1>
          <p className="muted text-base">{shortDate(date)} · {today.length} periods today</p>
        </div>
        <form className="flex items-end gap-2">
          {section && <input type="hidden" name="section" value={section.id} />}
          <label className="field">Date<input className="input" type="date" name="date" defaultValue={date} max={todayPK()} /></label>
          <button className="btn-ghost" type="submit">Go</button>
        </form>
      </div>

      {sections.length === 0 ? (
        <div className="card"><p className="muted">You aren&apos;t assigned to any section yet. Ask the principal to add you as a class or subject teacher.</p></div>
      ) : (
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
          <section className="card flex-[2]">
            <SectionPicker sections={sections} current={section!.id} base="/teacher" extra={`&date=${date}`} />
            <div>
              <div className="eyebrow">{already ? "Already marked · you can change it" : "Not marked yet"}</div>
              <h2 className="h2 text-2xl">Mark attendance · {section!.label}</h2>
            </div>
            {sp.saved && <div className="notice-ok">Saved.{Number(sp.alerts) > 0 ? ` A message is going to the parents of ${sp.alerts} absent student${sp.alerts === "1" ? "" : "s"}.` : ""}</div>}
            {sp.error && <div className="notice-bad">{sp.error}</div>}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Count n={counts.present} label="Present" bg="var(--green-soft)" ink="var(--green-ink)" />
              <Count n={counts.absent} label="Absent" bg="var(--red-soft)" ink="var(--red-ink)" />
              <Count n={counts.late} label="Late" bg="var(--orange-soft)" ink="var(--orange-ink)" />
              <Count n={counts.leave} label="On leave" bg="var(--purple-soft)" ink="var(--purple-ink)" />
            </div>
            <form action={saveAttendance} className="flex flex-col gap-2">
              <input type="hidden" name="section_id" value={section!.id} />
              <input type="hidden" name="date" value={date} />
              {(students ?? []).map((s) => {
                const cur = mark.get(s.id) ?? "present";
                return (
                  <fieldset key={s.id} className="row-box">
                    <legend className="sr-only">{s.full_name}</legend>
                    <input type="hidden" name="student_id" value={s.id} />
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black" style={{ background: "var(--blue-soft)", color: "var(--blue-ink)" }}>
                      {s.full_name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-extrabold">{s.full_name}</div>
                      <div className="muted text-xs">Roll {s.roll_no}</div>
                    </div>
                    <div className="flex gap-1.5">
                      {STATUS.map((o) => (
                        <label key={o.v} className={`seg ${o.k}`} title={o.name}>
                          <input type="radio" name={`status_${s.id}`} value={o.v} defaultChecked={cur === o.v} aria-label={`${s.full_name}: ${o.name}`} />
                          <span>{o.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <span className="muted">Everyone starts as present. Tap only the ones who aren&apos;t.</span>
                <div className="flex gap-2">
                  <button className="btn-ghost" type="reset">Undo changes</button>
                  <button className="btn" type="submit">{already ? "Update attendance" : "Submit attendance"}</button>
                </div>
              </div>
            </form>
          </section>

          <section className="card flex-1">
            <h2 className="h2">Today&apos;s periods</h2>
            {today.length === 0 && <p className="muted">No periods on the timetable for you today.</p>}
            {today.map((t) => (
              <div key={t.id} className="row-box">
                <b className="w-12 text-sm tabular-nums">{time(t.periods.starts_at)}</b>
                <div className="flex-1">
                  <div className="font-extrabold">{t.sections ? `${t.sections.classes.name}-${t.sections.name}` : ""} {t.subjects?.name}</div>
                  <div className="muted text-xs">{t.periods.name} · until {time(t.periods.ends_at)}</div>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 muted"><Icon.flame /> Mark each class in the first 10 minutes of period 1.</div>
          </section>
        </div>
      )}
    </>
  );
}

function Count({ n, label, bg, ink }: { n: number; label: string; bg: string; ink: string }) {
  return (
    <div className="rounded-2xl p-3 text-center" style={{ background: bg, color: ink }}>
      <div className="text-2xl font-black tabular-nums">{n}</div>
      <div className="text-xs font-extrabold uppercase tracking-wide">{label}</div>
    </div>
  );
}
