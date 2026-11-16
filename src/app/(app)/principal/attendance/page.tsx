import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { pct, shortDate, todayPK } from "@/lib/format";
import { LiveRefresh } from "@/components/live-refresh";
import { PageHead, Stats, Stat, Chips, Insight, Empty, Row } from "@/components/ilm";
import { loadMessagingConfig, readyChannels } from "@/lib/deliver";
import { saveAttendance } from "@/app/(app)/teacher/actions";

const GOAL = 0.9;
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
type Search = { period?: string; from?: string; to?: string; section?: string; date?: string; saved?: string; alerts?: string; error?: string };
const MARKS = [["present", "P", "p"], ["absent", "A", "a"], ["late", "L", "l"], ["leave", "Lv", "v"]] as const;

// Students' attendance across the school (design/Attendance.dc.html).
export default async function PrincipalAttendance({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const weekday = ((new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
  const period = ["today", "week", "month", "custom"].includes(sp.period ?? "") ? sp.period! : "today";
  const from = period === "week" ? iso(Date.parse(today) - (weekday - 1) * DAY) : period === "month" ? today.slice(0, 8) + "01"
    : period === "custom" && isDate(sp.from) ? sp.from! : today;
  const to = period === "custom" && isDate(sp.to) && sp.to! >= from ? sp.to! : today;
  const since = iso(Date.parse(today) - 20 * DAY);

  const [sections, byDay, rangeRows, absences, lates, config] = await Promise.all([
    supabase.from("sections").select("id, name, classes(name, sort)"),
    supabase.from("attendance_by_section_day").select("section_id, date, present, marked").gte("date", iso(Date.parse(today) - 14 * DAY)).order("date"),
    supabase.from("attendance").select("status").gte("date", from).lte("date", to).limit(50000),
    supabase.from("attendance").select("student_id, date, students(full_name, roll_no, families(phone, reminder_phone), sections(name, classes(name)))").eq("status", "absent").gte("date", since),
    supabase.from("attendance").select("student_id, students(full_name, sections(name, classes(name)))").eq("status", "late").gte("date", today.slice(0, 8) + "01"),
    loadMessagingConfig(supabase),
  ]);

  type Sec = { id: string; name: string; classes: { name: string; sort: number } };
  const secs = ((sections.data ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const rr = rangeRows.data ?? [];
  const count = (st: string) => rr.filter((r) => r.status === st).length;
  const present = count("present"), absent = count("absent"), late = count("late"), leave = count("leave");
  const marked = rr.length;
  const markedToday = new Set((byDay.data ?? []).filter((d) => d.date === today && d.marked > 0).map((d) => d.section_id));
  const notMarked = secs.filter((s) => !markedToday.has(s.id));
  const days = [...new Set((byDay.data ?? []).map((d) => d.date as string))].sort().slice(-5);
  const cell = (sec: string, date: string) => (byDay.data ?? []).find((d) => d.section_id === sec && d.date === date);
  const label = period === "today" ? shortDate(today) : `${shortDate(from)} – ${shortDate(to)}`;

  // weakest section, and its worst weekday, for the insight line
  const secRate = secs.map((s) => {
    const rows = (byDay.data ?? []).filter((d) => d.section_id === s.id && d.marked > 0);
    const m = rows.reduce((t, d) => t + d.marked, 0);
    return { s, r: m ? rows.reduce((t, d) => t + d.present, 0) / m : null, rows };
  }).filter((x) => x.r != null).sort((a, b) => a.r! - b.r!);
  const weakest = secRate[0];
  const WD = ["", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const worstDay = weakest?.rows.map((d) => ({ w: ((new Date(d.date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1, r: d.present / d.marked })).sort((a, b) => a.r - b.r)[0];

  type Ab = { student_id: string; date: string; students: { full_name: string; roll_no: string | null; families: { phone: string | null; reminder_phone: string | null } | null; sections: { name: string; classes: { name: string } } | null } };
  const tally = new Map<string, { id: string; n: number; mondays: number; name: string; cls: string; phone: string | null }>();
  for (const a of (absences.data ?? []) as unknown as Ab[]) {
    const s = a.students;
    const cur = tally.get(a.student_id) ?? { id: a.student_id, n: 0, mondays: 0, name: s.full_name, cls: s.sections ? `${s.sections.classes.name.replace("Class ", "")}-${s.sections.name}` : "", phone: s.families?.reminder_phone || s.families?.phone || null };
    cur.n++; if (new Date(a.date + "T00:00:00Z").getUTCDay() === 1) cur.mondays++;
    tally.set(a.student_id, cur);
  }
  const toCall = [...tally.values()].filter((x) => x.n >= 3).sort((a, b) => b.n - a.n);
  const lateCount = new Map<string, number>();
  const lateWho = new Map<string, { name: string; cls: string }>();
  for (const l of (lates.data ?? []) as unknown as { student_id: string; students: { full_name: string; sections: { name: string; classes: { name: string } } | null } }[]) {
    lateCount.set(l.student_id, (lateCount.get(l.student_id) ?? 0) + 1);
    lateWho.set(l.student_id, { name: l.students.full_name, cls: l.students.sections ? `${l.students.sections.classes.name.replace("Class ", "")}-${l.students.sections.name}` : "" });
  }

  // the section to mark on this page
  const section = secs.find((s) => s.id === sp.section) ?? notMarked[0] ?? secs[0];
  const date = isDate(sp.date) && sp.date! <= today ? sp.date! : today;
  const [{ data: kids }, { data: done }] = section
    ? await Promise.all([
      supabase.from("students").select("id, full_name, roll_no").eq("section_id", section.id).eq("status", "enrolled").order("roll_no"),
      supabase.from("attendance").select("student_id, status").eq("section_id", section.id).eq("date", date),
    ])
    : [{ data: [] }, { data: [] }];
  const mark = new Map((done ?? []).map((d) => [d.student_id, d.status as string]));
  const sms = readyChannels(config).length > 0;
  const periodHref = (p: string) => `/principal/attendance?period=${p}${section ? `&section=${section.id}` : ""}`;
  const callable = [
    ...toCall.map((s) => ({ ...s, why: `${s.n} absences in 3 weeks${s.mondays >= 2 && s.mondays === s.n ? " · all Mondays" : ""}` })),
    ...[...lateCount.entries()].filter(([id, n]) => n >= 4 && !tally.has(id)).map(([id, n]) => ({ id, n, name: lateWho.get(id)?.name ?? "", cls: lateWho.get(id)?.cls ?? "", phone: null as string | null, why: `Late ${n} times this month`, mondays: 0 })),
  ];

  return (
    <>
      <PageHead kick="Daily" title="Attendance" sub="Students by section, and who needs a call. Class teachers mark it in their app.">
        <LiveRefresh tables={["attendance"]} />
        <Link href="/principal/notices" className="btn-ghost">Remind teachers</Link>
        <Link href="#mark" className="btn">Mark a section</Link>
      </PageHead>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Chips label="Period" current={period} items={[["today", "Today"], ["week", "This week"], ["month", "This month"], ["custom", "Custom"]].map(([id, l]) => ({ id, label: l, href: periodHref(id) }))} />
        {period === "custom" ? (
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="period" value="custom" />
            <label className="field">From<input className="input" type="date" name="from" defaultValue={from} max={today} /></label>
            <label className="field">To<input className="input" type="date" name="to" defaultValue={to} max={today} /></label>
            <button className="btn-ghost" type="submit">Show</button>
          </form>
        ) : <span className="kick">{label}</span>}
      </div>

      <Stats>
        <Stat label="Present" value={marked ? pct((present + late) / marked, 1) : "—"} tone="#15803d" sub={marked ? `${(present + late).toLocaleString("en-IN")} student-days` : "nothing marked"} />
        <Stat label="Absent" value={marked ? pct(absent / marked, 1) : "—"} tone="#b91c1c" sub={`${absent.toLocaleString("en-IN")} student-days`} />
        <Stat label="On leave" value={leave.toLocaleString("en-IN")} tone="#c2410c" sub="approved" />
        <Stat label="Late" value={late.toLocaleString("en-IN")} sub="counted present" />
        <Stat label="Not marked" value={notMarked.length} sub={`of ${secs.length} sections today`} warn />
      </Stats>

      <section className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_540px] flex-col gap-5">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">Section heatmap</h2>
              {markedToday.size > 0 && notMarked.length > 0 ? <span className="tagx r">{notMarked.length} of {secs.length} not marked today</span>
                : <span className="flex flex-wrap gap-2 text-[12px] font-extrabold text-[#4b5563]">{[["#16a34a", "95%+"], ["#86efac", "90-95%"], ["#fcd34d", "Below 90%"], ["#e5e7eb", "Not marked"]].map(([c, t]) => <span key={t} className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: c }} />{t}</span>)}</span>}
            </div>
            {days.length === 0 ? <div className="mt-3"><Empty>No attendance marked in the last two weeks.</Empty></div> : (
              <div className="mt-3 overflow-x-auto">
                <div className="grid min-w-[420px] gap-1.5" style={{ gridTemplateColumns: `100px repeat(${days.length}, minmax(0, 1fr))` }}>
                  <span />
                  {days.map((d) => <span key={d} className="kick text-center">{d === today ? "Today" : new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</span>)}
                  {secs.map((s) => (
                    <HeatRow key={s.id} label={`${s.classes.name.replace("Class ", "Class ")}-${s.name}`} href={`/principal/attendance?section=${s.id}#mark`}
                      cells={days.map((d) => { const c = cell(s.id, d); return c && c.marked ? c.present / c.marked : null; })} />
                  ))}
                </div>
              </div>
            )}
            {weakest && weakest.r! < GOAL && (
              <div className="mt-3"><Insight>{weakest.s.classes.name}-{weakest.s.name} is lowest at {pct(weakest.r!)} over two weeks{worstDay && worstDay.r < weakest.r! ? `, worst on ${WD[worstDay.w]} (${pct(worstDay.r)})` : ""}.</Insight></div>
            )}
          </div>

          {section && (
            <div id="mark" className="card scroll-mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <h2 className="h2">Mark {section.classes.name}-{section.name} · {date === today ? "today" : shortDate(date)}</h2>
                <form className="flex flex-wrap items-center gap-2">
                  <select className="input" style={{ minHeight: 38 }} name="section" defaultValue={section.id} aria-label="Section">
                    {secs.map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}{markedToday.has(s.id) ? "" : " · not marked"}</option>)}
                  </select>
                  <input className="input" style={{ minHeight: 38 }} type="date" name="date" defaultValue={date} max={today} aria-label="Day" />
                  <button className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }} type="submit">Open</button>
                </form>
              </div>
              {sp.saved && <div className="notice-ok mt-2">Saved.{Number(sp.alerts) > 0 ? ` A message is going to the parents of ${sp.alerts} absent student${sp.alerts === "1" ? "" : "s"}.` : ""}</div>}
              {sp.error && <div className="notice-bad mt-2">{sp.error}</div>}
              <p className="muted text-[13px]">{mark.size ? `${[...mark.values()].filter((v) => v === "present" || v === "late").length} P · ${[...mark.values()].filter((v) => v === "absent").length} A · ${[...mark.values()].filter((v) => v === "leave").length} Lv` : "Not marked yet. Everyone starts as present."}</p>
              {(kids ?? []).length === 0 ? <div className="mt-2"><Empty>No students in this section.</Empty></div> : (
                <form action={saveAttendance} className="mt-1 flex flex-col">
                  <input type="hidden" name="section_id" value={section.id} /><input type="hidden" name="date" value={date} /><input type="hidden" name="back" value="principal" />
                  {(kids ?? []).map((k) => (
                    <fieldset key={k.id}>
                      <legend className="sr-only">{k.full_name}</legend>
                      <input type="hidden" name="student_id" value={k.id} />
                      <Row>
                        <span className="w-10 font-black tabular-nums text-[#6b7280]">{k.roll_no ?? "—"}</span>
                        <div className="min-w-0 flex-1"><div className="truncate font-black">{k.full_name}</div>
                          {tally.get(k.id) && <div className="muted text-[12px]">{tally.get(k.id)!.n} absences in 3 weeks</div>}</div>
                        <div className="flex gap-1.5">
                          {MARKS.map(([v, l, c]) => (
                            <label key={v} className={`seg ${c}`}><input type="radio" name={`status_${k.id}`} value={v} defaultChecked={(mark.get(k.id) ?? "present") === v} aria-label={`${k.full_name}: ${v}`} /><span>{l}</span></label>
                          ))}
                        </div>
                      </Row>
                    </fieldset>
                  ))}
                  <div className="mt-3 flex flex-wrap justify-end gap-2.5">
                    <button className="btn" type="submit">{sms ? "Save · message absent parents" : "Save attendance"}</button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
          <div className="card">
            <div className="flex items-center justify-between"><h2 className="h2">Students to call</h2>{callable.length > 0 && <span className="tagx r">{callable.length}</span>}</div>
            {callable.length === 0 && <div className="mt-2"><Empty>Nobody right now.</Empty></div>}
            {callable.slice(0, 12).map((s) => (
              <Row key={s.id + s.why}>
                <div className="min-w-0 flex-1"><Link href={`/principal/students/${s.id}`} className="font-black">{s.name || "Student"}{s.cls ? ` · ${s.cls}` : ""}</Link><div className="muted text-[12px]">{s.why}</div></div>
                {s.phone ? <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="btn-ghost" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }}>Call</a>
                  : <Link href={`/principal/students/${s.id}`} className="btn-ghost" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }}>File</Link>}
              </Row>
            ))}
          </div>
          <div className="card">
            <h2 className="h2">Rules</h2>
            <Row><span className="flex-1 font-bold">Message parent when absent</span><span className={`tagx ${sms ? "g" : ""}`}>{sms ? "On" : "Not connected"}</span></Row>
            <Row><span className="flex-1 font-bold">Late</span><span className="font-black">counts as present</span></Row>
            <Row><span className="flex-1 font-bold">Flag after absences</span><span className="font-black">3 in 3 weeks</span></Row>
            <Row><span className="flex-1 font-bold">Goal</span><span className="font-black">{pct(GOAL)}</span></Row>
            <Link href="/settings" className="mt-2 inline-block text-[14px] font-extrabold text-[#0369a1]">Change in Settings</Link>
          </div>
        </div>
      </section>
    </>
  );
}

function HeatRow({ label, href, cells }: { label: string; href: string; cells: (number | null)[] }) {
  return (
    <>
      <Link href={href} className="truncate text-[13px] font-black hover:text-[#0369a1]">{label}</Link>
      {cells.map((r, i) => {
        const bg = r == null ? "#e5e7eb" : r >= 0.95 ? "#16a34a" : r >= GOAL ? "#86efac" : "#fcd34d";
        const fg = r == null ? "#6b7280" : r >= 0.95 ? "#fff" : "#1f2937";
        return <span key={i} className="rounded-lg py-1.5 text-center text-[12px] font-black tabular-nums" style={{ background: bg, color: fg }}>{r == null ? "—" : Math.round(r * 100)}</span>;
      })}
    </>
  );
}
