import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { pct, shortDate, todayPK } from "@/lib/format";
import { allRows } from "@/lib/outbox";
import { AttendanceChart, GOAL } from "@/components/attendance-chart";

type Sec = { id: string; name: string; class_teacher_id: string | null; classes: { name: string; sort: number }; profiles: { full_name: string; phone: string | null } | null };
type Absent = { student_id: string; date: string; students: { full_name: string; section_id: string | null; families: { name: string; phone: string | null; reminder_phone: string | null } | null } | null };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const digits = (p: string) => p.replace(/[^\d]/g, "");
const wa = (p: string, text: string) => { const d = digits(p); return `https://wa.me/${d.startsWith("0") ? "92" + d.slice(1) : d}?text=${encodeURIComponent(text)}`; };

// Attendance for the principal: today by class, who has not marked, the 30-day trend,
// weekday pattern, children who keep missing school, and staff attendance this month.
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const me = await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const day = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const since = new Date(Date.parse(day) - 29 * 86400000).toISOString().slice(0, 10);
  const since60 = new Date(Date.parse(day) - 59 * 86400000).toISOString().slice(0, 10);
  const monthStart = day.slice(0, 8) + "01";

  const [{ data: sections }, enrolled, { data: trend }, secDays, absents, { data: staff }, { data: staffMarks }, { data: onLeave }] = await Promise.all([
    supabase.from("sections").select("id, name, class_teacher_id, classes(name, sort), profiles!sections_class_teacher_id_fkey(full_name, phone)"),
    allRows<{ section_id: string | null }>((a, b) => supabase.from("students").select("section_id").eq("status", "enrolled").order("id").range(a, b) as never),
    supabase.from("attendance_by_day").select("date, rate, marked, present, absent, late, on_leave").gte("date", since60).lte("date", day).order("date"),
    allRows<{ section_id: string; date: string; present: number; marked: number }>((a, b) => supabase.from("attendance_by_section_day").select("section_id, date, present, marked").gte("date", since).lte("date", day).order("date").order("section_id").range(a, b) as never),
    allRows<Absent>((a, b) => supabase.from("attendance").select("student_id, date, students(full_name, section_id, families(name, phone, reminder_phone))").eq("status", "absent").gte("date", since).lte("date", day).order("date").order("student_id").range(a, b) as never),
    supabase.from("profiles").select("id, full_name, role").in("role", ["principal", "teacher", "accountant"]).eq("is_active", true).order("full_name"),
    supabase.from("staff_attendance").select("profile_id, date, status").gte("date", monthStart).lte("date", day),
    supabase.from("leave_requests").select("profile_id").eq("status", "approved").lte("from_on", day).gte("to_on", day),
  ]);

  const secs = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const size = new Map<string, number>();
  for (const s of enrolled) if (s.section_id) size.set(s.section_id, (size.get(s.section_id) ?? 0) + 1);
  const withKids = secs.filter((s) => (size.get(s.id) ?? 0) > 0);

  // the chosen day
  const dayRows = new Map(secDays.filter((r) => r.date === day).map((r) => [r.section_id, r]));
  const totals = (trend ?? []).find((t) => t.date === day);
  // Sunday or a holiday: nothing to mark, so no reminders
  const { data: holiday } = await supabase.from("holidays").select("title").neq("kind", "event").lte("starts_on", day).gte("ends_on", day).limit(1).maybeSingle();
  const offDay = new Date(day + "T00:00:00Z").getUTCDay() === 0 ? "Sunday" : holiday?.title ?? null;
  const notMarked = offDay ? [] : withKids.filter((s) => !dayRows.has(s.id));
  const rateDay = totals && totals.marked ? Number(totals.rate) : null;

  // by class: present out of marked, across that class's sections
  const classMap = new Map<string, { name: string; sort: number; present: number; marked: number; sections: { s: Sec; rate: number | null }[] }>();
  for (const s of withKids) {
    const r = dayRows.get(s.id);
    const c = classMap.get(s.classes.name) ?? { name: s.classes.name, sort: s.classes.sort, present: 0, marked: 0, sections: [] };
    if (r) { c.present += Number(r.present); c.marked += Number(r.marked); }
    c.sections.push({ s, rate: r && r.marked ? Number(r.present) / Number(r.marked) : null });
    classMap.set(s.classes.name, c);
  }
  const byClass = [...classMap.values()].sort((a, b) => a.sort - b.sort);

  // weekday pattern over 60 days
  const wk = WEEKDAYS.map(() => ({ p: 0, m: 0 }));
  for (const t of trend ?? []) {
    const w = (new Date(t.date + "T00:00:00Z").getUTCDay() + 6) % 7;
    if (w < 6) { wk[w].p += Number(t.present); wk[w].m += Number(t.marked); }
  }
  const wkRates = wk.map((x) => (x.m ? x.p / x.m : null));
  const wkLow = Math.min(...wkRates.filter((x): x is number => x !== null));

  // children who keep missing school: 3+ absences in a row, or under 75% in 30 days
  const markedDates = new Map<string, string[]>(); // section -> dates marked, newest first
  for (const r of secDays) markedDates.set(r.section_id, [...(markedDates.get(r.section_id) ?? []), r.date]);
  for (const v of markedDates.values()) v.sort((a, b) => b.localeCompare(a));
  const absentOn = new Map<string, { info: Absent["students"]; dates: Set<string> }>();
  for (const a of absents) {
    const e = absentOn.get(a.student_id) ?? { info: a.students, dates: new Set<string>() };
    e.dates.add(a.date); absentOn.set(a.student_id, e);
  }
  const secName = new Map(secs.map((s) => [s.id, `${s.classes.name}-${s.name}`]));
  const watch = [...absentOn.entries()].map(([id, e]) => {
    const dates = markedDates.get(e.info?.section_id ?? "") ?? [];
    let streak = 0;
    for (const d of dates) { if (e.dates.has(d)) streak += 1; else break; }
    const rate = dates.length ? 1 - e.dates.size / dates.length : 1;
    return { id, name: e.info?.full_name ?? "", sec: secName.get(e.info?.section_id ?? "") ?? "", fam: e.info?.families, streak, absent: e.dates.size, rate };
  }).filter((w) => w.streak >= 3 || w.rate < 0.75).sort((a, b) => b.streak - a.streak || a.rate - b.rate);

  // staff this month
  type Tally = { present: number; late: number; absent: number; leave: number };
  const tally = new Map<string, Tally>();
  for (const m of staffMarks ?? []) {
    const t = tally.get(m.profile_id) ?? { present: 0, late: 0, absent: 0, leave: 0 };
    t[m.status as keyof Tally] += 1; tally.set(m.profile_id, t);
  }
  const staffToday = new Map((staffMarks ?? []).filter((m) => m.date === day).map((m) => [m.profile_id, m.status]));
  const leaveToday = new Set((onLeave ?? []).map((l) => l.profile_id));
  const staffList = staff ?? [];
  const staffIn = staffList.filter((s) => ["present", "late"].includes(staffToday.get(s.id) ?? "")).length;
  const staffLate = staffList.filter((s) => staffToday.get(s.id) === "late").length;
  const staffAway = staffList.filter((s) => staffToday.get(s.id) === "absent").length;

  const series = (trend ?? []).filter((t) => t.date >= since && t.marked).map((t) => ({ date: t.date, rate: Number(t.rate) }));
  const tone = (r: number | null) => r === null ? "bg-surface-variant text-on-surface-variant" : r >= 0.95 ? "bg-secondary text-on-secondary" : r >= GOAL ? "bg-secondary-fixed-dim text-primary" : r >= 0.8 ? "bg-tertiary-fixed-dim text-primary" : "bg-error text-on-error";
  const nudge = (s: Sec) => `Assalam o Alaikum ${s.profiles?.full_name ?? ""}, please mark today's attendance for ${s.classes.name}-${s.name} in Ilmora. ${me.campus_name}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Attendance</h1>
          <p className="muted text-base">Students and staff: today, the last 30 days, and who needs a call.</p>
        </div>
        <form className="flex items-end gap-2" action="/principal/attendance">
          <label className="field">Day<input className="input" type="date" name="date" defaultValue={day} max={today} /></label>
          <button className="btn-ghost" type="submit">Show</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={day === today ? "Students present today" : `Present on ${shortDate(day)}`} value={rateDay === null ? "Not marked" : pct(rateDay, 1)} note={totals ? `${Number(totals.present).toLocaleString("en-PK")} of ${Number(totals.marked).toLocaleString("en-PK")} marked` : undefined} warn={rateDay !== null && rateDay < GOAL} />
        <Kpi label="Absent · late · leave" value={totals ? `${totals.absent} · ${totals.late} · ${totals.on_leave}` : "—"} />
        <Kpi label="Sections not marked" value={offDay ? `${offDay}: off` : `${notMarked.length} of ${withKids.length}`} warn={notMarked.length > 0} />
        <Kpi label="Staff in school" value={`${staffIn} of ${staffList.length}`} note={`${staffLate} late · ${staffAway} absent · ${leaveToday.size} on leave`} />
      </div>

      {notMarked.length > 0 && (
        <section className="card flex flex-col gap-3 border-error/40">
          <h2 className="h2 flex items-center gap-2"><span className="msym text-[22px] text-error">notification_important</span>Not marked yet</h2>
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {notMarked.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-primary">{s.classes.name}-{s.name}</div>
                  <div className="truncate text-body-sm text-on-surface-variant">{s.profiles?.full_name ?? "No class teacher"} · {size.get(s.id)} students</div>
                </div>
                {s.profiles?.phone && <a className="btn-ghost inline-flex min-h-10 items-center gap-1 px-3" href={wa(s.profiles.phone, nudge(s))} target="_blank" rel="noreferrer"><span className="msym text-[18px]">forum</span>Remind</a>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="card flex flex-col gap-2 xl:col-span-2">
          <div className="flex items-center justify-between"><h2 className="h2">Last 30 days</h2><span className="text-label-sm text-on-surface-variant">Red line: 90% goal</span></div>
          <AttendanceChart series={series} today={today} />
        </section>
        <section className="card flex flex-col gap-3">
          <h2 className="h2">By weekday</h2>
          <p className="muted text-sm">Last 60 days. The weakest day is shown in red.</p>
          <div className="flex h-40 items-end gap-2" role="img" aria-label="Average attendance by weekday">
            {wkRates.map((r, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] font-semibold tabular-nums">{r === null ? "—" : pct(r)}</span>
                <div className="flex h-28 w-full items-end"><div className={`w-full rounded-t ${r !== null && r === wkLow ? "bg-error" : "bg-primary"}`} style={{ height: r === null ? "2%" : `${Math.max(4, ((r - 0.6) / 0.4) * 100)}%` }} /></div>
                <span className="text-[11px] text-on-surface-variant">{WEEKDAYS[i]}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">By class {day === today ? "today" : `on ${shortDate(day)}`}</h2>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {byClass.map((c) => {
            const r = c.marked ? c.present / c.marked : null;
            return (
              <div key={c.name} className="rounded-lg border border-surface-variant p-3">
                <div className="flex items-center justify-between"><span className="font-bold text-primary">{c.name}</span><span className="text-title-md font-extrabold tabular-nums">{r === null ? "—" : pct(r)}</span></div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.sections.map(({ s, rate }) => (
                    <Link key={s.id} href={`/principal/students?section=${s.id}`} className={`rounded px-2 py-1 text-label-sm font-semibold ${tone(rate)}`} title={`${s.classes.name}-${s.name}`}>
                      {s.name} {rate === null ? "not marked" : pct(rate)}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2"><h2 className="h2">Children to call</h2><span className="pill pill-gray">{watch.length}</span></div>
          <p className="muted text-sm">Absent 3 or more days in a row, or below 75% in the last 30 days (the board needs 75%).</p>
          {watch.length === 0 && <p className="muted">Nobody right now.</p>}
          <ul className="divide-y divide-surface-variant">
            {watch.slice(0, 25).map((w) => {
              const phone = w.fam?.reminder_phone || w.fam?.phone;
              return (
                <li key={w.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/principal/students/${w.id}`} className="font-bold text-primary hover:underline">{w.name}</Link>
                    <div className="text-body-sm text-on-surface-variant">{w.sec} · {w.streak >= 3 ? <b className="text-error">{w.streak} days in a row</b> : `${w.absent} absences`} · {pct(w.rate)} in 30 days</div>
                  </div>
                  {phone && <a href={`tel:${digits(phone)}`} aria-label={`Call ${w.fam?.name}`} className="grid h-10 w-10 place-items-center rounded-full bg-surface-container-low text-primary"><span className="msym text-[20px]">call</span></a>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="h2">Staff this month</h2>
            <Link href="/principal/staff" className="text-label-md font-semibold text-primary underline">Mark or change</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Name</th><th>{day === today ? "Today" : shortDate(day)}</th><th className="text-right">Present</th><th className="text-right">Late</th><th className="text-right">Absent</th><th className="text-right">Leave</th></tr></thead>
              <tbody>
                {staffList.map((s) => {
                  const t = tally.get(s.id) ?? { present: 0, late: 0, absent: 0, leave: 0 };
                  const st = staffToday.get(s.id) ?? (leaveToday.has(s.id) ? "leave" : null);
                  return (
                    <tr key={s.id}>
                      <td><Link href={`/principal/staff/${s.id}`} className="font-semibold hover:underline">{s.full_name}</Link><span className="block text-body-sm capitalize text-on-surface-variant">{s.role}</span></td>
                      <td><span className={`rounded-full px-2 py-0.5 text-label-sm ${st === "present" ? "bg-secondary-fixed/50 text-secondary" : st === "late" ? "bg-tertiary-fixed text-primary" : st === "absent" ? "bg-error-container text-error" : st === "leave" ? "bg-surface-variant text-on-surface-variant" : "text-on-surface-variant"}`}>{st ?? "not marked"}</span></td>
                      <td className="text-right tabular-nums">{t.present}</td>
                      <td className={`text-right tabular-nums ${t.late >= 3 ? "font-bold text-tertiary" : ""}`}>{t.late}</td>
                      <td className={`text-right tabular-nums ${t.absent >= 2 ? "font-bold text-error" : ""}`}>{t.absent}</td>
                      <td className="text-right tabular-nums">{t.leave}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="card !p-4">
      <div className="text-label-md text-on-surface-variant">{label}</div>
      <div className={`mt-1 text-headline-sm font-extrabold ${warn ? "text-error" : "text-primary"}`}>{value}</div>
      {note && <div className="text-body-sm text-on-surface-variant">{note}</div>}
    </div>
  );
}
