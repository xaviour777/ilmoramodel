import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { pct, shortDate, todayPK } from "@/lib/format";
import { LiveRefresh } from "@/components/live-refresh";
import { PageHead, Chips, Empty, Row } from "@/components/ilm";
import { fetchAll } from "@/lib/fetch-all";
import { PrintButton } from "@/app/print/paper-check/[id]/print-button";

// Attendance report for the principal (design/Attendance.dc.html).
// Teachers mark attendance in their own app; this page only reads it.

const GOAL = 0.9;
const CHRONIC = 0.8;
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const wd = (d: string) => ((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7) + 1; // Mon = 1
const lastYear = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`.replace(/-02-29$/, "-02-28");
const pkTime = (ts: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ts));
const pkDate = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(ts));
const LEVELS = [
  { id: "Primary", test: (n: number) => n <= 5 },
  { id: "Middle", test: (n: number) => n >= 6 && n <= 8 },
  { id: "Matric", test: (n: number) => n >= 9 },
];
const WD = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WDL = ["", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

type Search = { period?: string; from?: string; to?: string; cls?: string; gender?: string; cmp?: string; sort?: string };
type A = { student_id: string; section_id: string; date: string; status: string; marked_at: string; marked_by: string | null; students: { gender: string | null } | null };

const present = (s: string) => s === "present" || s === "late";
const rate = (rows: { status: string }[]) => (rows.length ? rows.filter((r) => present(r.status)).length / rows.length : null);

export default async function PrincipalAttendance({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();

  const [{ data: term }, { data: sections }, { data: classes }] = await Promise.all([
    supabase.from("terms").select("name, starts_on").lte("starts_on", today).gte("ends_on", today).maybeSingle(),
    supabase.from("sections").select("id, name, class_id, class_teacher_id, classes(name, sort), profiles!sections_class_teacher_id_fkey(full_name, phone)"),
    supabase.from("classes").select("id, name, sort").order("sort"),
  ]);

  // ---------- period, filters and comparison ----------
  const period = ["week", "month", "term", "custom"].includes(sp.period ?? "") ? sp.period! : "month";
  const from = period === "week" ? iso(Date.parse(today) - (wd(today) - 1) * DAY)
    : period === "term" ? term?.starts_on ?? today.slice(0, 8) + "01"
    : period === "custom" && isDate(sp.from) ? sp.from! : today.slice(0, 8) + "01";
  const to = period === "custom" && isDate(sp.to) && sp.to! >= from ? sp.to! : today;
  const span = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  const cmp = ["prev", "year", "goal"].includes(sp.cmp ?? "") ? sp.cmp! : "prev";
  const [cFrom, cTo] = cmp === "year" ? [lastYear(from), lastYear(to)] : [iso(Date.parse(from) - span * DAY), iso(Date.parse(from) - DAY)];
  const cmpLabel = cmp === "goal" ? "the 90% goal" : cmp === "year" ? "same time last year" : period === "week" ? "last week" : period === "month" ? "last month" : "the period before";
  const gender = sp.gender === "male" || sp.gender === "female" ? sp.gender : "";
  const cls = (classes ?? []).find((c) => c.id === sp.cls);

  type Sec = { id: string; name: string; class_id: string; class_teacher_id: string | null; classes: { name: string; sort: number }; profiles: { full_name: string; phone: string | null } | null };
  const secs = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const secById = new Map(secs.map((s) => [s.id, s]));
  const inScope = secs.filter((s) => !cls || s.class_id === cls.id).map((s) => s.id);

  // ---------- attendance rows: this period and the comparison period ----------
  const load = (a: string, b: string) => inScope.length ? fetchAll<A>((f, t) => supabase.from("attendance")
    .select("student_id, section_id, date, status, marked_at, marked_by, students(gender)")
    .gte("date", a).lte("date", b).in("section_id", inScope).order("date").order("student_id").range(f, t) as unknown as PromiseLike<{ data: A[] | null; error: unknown }>) : Promise.resolve([] as A[]);
  const eightWeeks = iso(Date.parse(today) - 55 * DAY);
  const [allNow, allPrev, weekly, todayDone, holidayToday] = await Promise.all([
    load(from, to),
    cmp === "goal" ? Promise.resolve([] as A[]) : load(cFrom, cTo),
    fetchAll<{ section_id: string; date: string; present: number; marked: number }>((f, t) => supabase.from("attendance_by_section_day").select("section_id, date, present, marked")
      .gte("date", eightWeeks).lte("date", today).order("date").order("section_id").range(f, t) as unknown as PromiseLike<{ data: { section_id: string; date: string; present: number; marked: number }[] | null; error: unknown }>),
    supabase.from("attendance_by_section_day").select("section_id").eq("date", today),
    supabase.from("holidays").select("title").lte("starts_on", today).gte("ends_on", today).limit(1).maybeSingle(),
  ]);
  const byGender = (rows: A[]) => (gender ? rows.filter((r) => r.students?.gender === gender) : rows);
  const now = byGender(allNow), prev = byGender(allPrev);

  // ---------- the five cards ----------
  const attNow = rate(now), attPrev = cmp === "goal" ? GOAL : rate(prev);
  const count = (rows: A[], st: string) => rows.filter((r) => r.status === st).length;
  const perStudent = (rows: A[]) => {
    const m = new Map<string, { n: number; p: number; absent: number; late: number; mondays: number; section: string }>();
    for (const r of rows) {
      const c = m.get(r.student_id) ?? { n: 0, p: 0, absent: 0, late: 0, mondays: 0, section: r.section_id };
      c.n++; if (present(r.status)) c.p++;
      if (r.status === "absent") { c.absent++; if (wd(r.date) === 1) c.mondays++; }
      if (r.status === "late") c.late++;
      m.set(r.student_id, c);
    }
    return m;
  };
  // a student needs a few marked days before a rate means anything
  const minDays = Math.min(5, new Set(now.map((r) => r.date)).size);
  const stuNow = perStudent(now), stuPrev = perStudent(prev);
  type Stu = ReturnType<typeof perStudent> extends Map<string, infer V> ? V : never;
  const chronicOf = (m: Map<string, Stu>, min: number) => [...m.entries()].filter(([, c]) => c.n >= Math.max(1, min) && c.p / c.n < CHRONIC);
  const perfectOf = (m: Map<string, Stu>, min: number) => [...m.values()].filter((c) => c.n >= Math.max(1, min) && c.p === c.n).length;
  const chronic = chronicOf(stuNow, minDays).sort((a, b) => a[1].p / a[1].n - b[1].p / b[1].n);
  const prevMin = Math.min(5, new Set(prev.map((r) => r.date)).size);
  const cards = [
    { l: "Attendance", v: attNow == null ? "—" : pct(attNow, 1), d: attNow != null && attPrev != null ? (attNow - attPrev) * 100 : null, unit: " pts", good: 1, tone: attNow != null && attNow < GOAL ? "#b91c1c" : "#15803d" },
    { l: "Absent student-days", v: count(now, "absent").toLocaleString("en-IN"), d: cmp === "goal" || !prev.length ? null : count(now, "absent") - count(prev, "absent"), unit: "", good: -1, tone: "#b91c1c" },
    { l: "Late arrivals", v: count(now, "late").toLocaleString("en-IN"), d: cmp === "goal" || !prev.length ? null : count(now, "late") - count(prev, "late"), unit: "", good: -1, tone: "#c2410c" },
    { l: "Chronic absentees", v: String(chronic.length), d: cmp === "goal" || !prev.length ? null : chronic.length - chronicOf(stuPrev, prevMin).length, unit: "", good: -1, tone: "#b91c1c", sub: "below 80% this period" },
    { l: "Perfect attendance", v: String(perfectOf(stuNow, minDays)), d: cmp === "goal" || !prev.length ? null : perfectOf(stuNow, minDays) - perfectOf(stuPrev, prevMin), unit: "", good: 1, tone: "#15803d", sub: "students, 100%" },
  ];

  // ---------- today: sections not marked yet ----------
  const schoolDay = wd(today) <= 6 && !holidayToday.data;
  const marked = new Set((todayDone.data ?? []).map((x) => x.section_id));
  const notMarked = schoolDay ? secs.filter((s) => !marked.has(s.id)) : [];
  const nowHM = pkTime(new Date().toISOString());

  // ---------- trend: this period vs comparison, bucketed ----------
  const unit = span <= 14 ? "day" : span <= 92 ? "week" : "month";
  const bucket = (d: string, start: string) => unit === "day" ? Math.round((Date.parse(d) - Date.parse(start)) / DAY)
    : unit === "week" ? Math.floor((Date.parse(d) - Date.parse(start)) / (7 * DAY)) : (Number(d.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(start.slice(5, 7));
  const series = (rows: A[], start: string) => {
    const m = new Map<number, A[]>();
    for (const r of rows) m.set(bucket(r.date, start), [...(m.get(bucket(r.date, start)) ?? []), r]);
    return m;
  };
  const sNow = series(now, from), sPrev = series(prev, cFrom);
  const trend = [...sNow.keys()].sort((a, b) => a - b).map((k) => {
    const rows = sNow.get(k)!;
    const label = unit === "day" ? `${WD[wd(rows[0].date)] ?? "Sun"} ${Number(rows[0].date.slice(8))}` : unit === "week" ? `Wk ${k + 1}` : new Date(rows[0].date + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
    return { label, v: rate(rows)!, p: cmp === "goal" ? null : rate(sPrev.get(k) ?? []) };
  });
  const lo = Math.max(0, Math.floor((Math.min(GOAL, ...trend.flatMap((t) => [t.v, t.p ?? 1])) - 0.05) * 20) / 20);
  const h = (r: number) => `${Math.max(2, ((r - lo) / (1 - lo)) * 100)}%`;

  // ---------- compare classes ----------
  const sort = ["low", "drop", "class"].includes(sp.sort ?? "") ? sp.sort! : "low";
  const classRows = (classes ?? []).map((c) => {
    const ids = new Set(secs.filter((s) => s.class_id === c.id).map((s) => s.id));
    const v = rate(now.filter((r) => ids.has(r.section_id)));
    const pv = cmp === "goal" ? GOAL : rate(prev.filter((r) => ids.has(r.section_id)));
    const teachers = [...new Set(secs.filter((s) => s.class_id === c.id).map((s) => s.profiles?.full_name).filter(Boolean))] as string[];
    return { id: c.id, n: c.name, sort: c.sort, v, pv, teachers };
  }).filter((c) => c.v != null);
  classRows.sort((a, b) => sort === "class" ? a.sort - b.sort : sort === "drop" ? (a.v! - (a.pv ?? a.v!)) - (b.v! - (b.pv ?? b.v!)) : a.v! - b.v!);
  const pos = (r: number) => `${Math.max(0, Math.min(100, ((r - lo) / (1 - lo)) * 100))}%`;

  // ---------- day-of-week by level, last 8 weeks (all students: the view has no gender) ----------
  const levelOf = (secId: string) => { const s = secById.get(secId); return s ? LEVELS.find((l) => l.test(s.classes.sort))?.id : undefined; };
  const heat = LEVELS.map((l) => ({
    l: l.id,
    cells: [1, 2, 3, 4, 5, 6].map((w) => {
      const rows = weekly.filter((x) => wd(x.date) === w && levelOf(x.section_id) === l.id && (!cls || secById.get(x.section_id)?.class_id === cls.id));
      const m = rows.reduce((t, x) => t + x.marked, 0);
      return m ? rows.reduce((t, x) => t + x.present, 0) / m : null;
    }),
  })).filter((r) => r.cells.some((c) => c != null));
  const hasSat = heat.some((r) => r.cells[5] != null);

  // ---------- boys vs girls (ignores the gender filter so both show) ----------
  const allScoped = allNow;
  const boys = rate(allScoped.filter((r) => r.students?.gender === "male")), girls = rate(allScoped.filter((r) => r.students?.gender === "female"));

  // ---------- chronic absentee names and phones ----------
  const chronicIds = chronic.slice(0, 12).map(([id]) => id);
  const { data: chronicInfo } = chronicIds.length
    ? await supabase.from("students").select("id, full_name, families(phone, reminder_phone)").in("id", chronicIds)
    : { data: [] };
  const info = new Map(((chronicInfo ?? []) as unknown as { id: string; full_name: string; families: { phone: string | null; reminder_phone: string | null } | null }[]).map((s) => [s.id, s]));

  // ---------- teachers marking on time (first save of each section-day before 9:00 am) ----------
  const firstSave = new Map<string, { at: string; by: string | null; date: string; sec: string }>();
  for (const r of allNow) {
    const k = `${r.section_id}|${r.date}`;
    const cur = firstSave.get(k);
    if (!cur || r.marked_at < cur.at) firstSave.set(k, { at: r.marked_at, by: r.marked_by, date: r.date, sec: r.section_id });
  }
  const onTime = new Map<string, { n: number; ok: number; secs: Set<string> }>();
  for (const f of firstSave.values()) {
    const who = f.by ?? secById.get(f.sec)?.class_teacher_id ?? "";
    if (!who) continue;
    const c = onTime.get(who) ?? { n: 0, ok: 0, secs: new Set<string>() };
    c.n++; c.secs.add(f.sec);
    if (pkDate(f.at) === f.date && pkTime(f.at) < "09:00") c.ok++;
    onTime.set(who, c);
  }
  const markerIds = [...onTime.keys()];
  const { data: markers } = markerIds.length ? await supabase.from("profiles").select("id, full_name").in("id", markerIds) : { data: [] };
  const markerName = new Map((markers ?? []).map((m) => [m.id, m.full_name]));
  const onTimeRows = [...onTime.entries()].map(([id, c]) => ({ id, name: markerName.get(id) ?? "Staff", r: c.ok / c.n, n: c.n, secs: [...c.secs].map((s) => secById.get(s)).filter(Boolean).map((s) => `${s!.classes.name.replace("Class ", "")}-${s!.name}`) }))
    .sort((a, b) => a.r - b.r);

  // ---------- insights: plain sentences from the numbers above ----------
  const insights: string[] = [];
  const weakDays = heat.map((r) => { const vals = r.cells.map((v, i) => ({ v, w: i + 1 })).filter((x) => x.v != null) as { v: number; w: number }[]; return { l: r.l, worst: vals.sort((a, b) => a.v - b.v)[0] }; }).filter((x) => x.worst);
  if (weakDays.length) {
    const same = weakDays.every((x) => x.worst.w === weakDays[0].worst.w);
    const low = [...weakDays].sort((a, b) => a.worst.v - b.worst.v)[0];
    insights.push(same ? `${WDL[weakDays[0].worst.w]} are the weakest day in every level; ${low.l} drops to ${pct(low.worst.v)}.` : `${low.l}'s weakest day is ${WDL[low.worst.w]} at ${pct(low.worst.v)} (last 8 weeks).`);
  }
  if (cmp !== "goal") {
    const drop = classRows.filter((c) => c.pv != null).map((c) => ({ ...c, d: c.v! - c.pv! })).sort((a, b) => a.d - b.d)[0];
    if (drop && drop.d <= -0.01) insights.push(`${drop.n} fell ${Math.abs(Math.round(drop.d * 100))} points compared with ${cmpLabel}, to ${pct(drop.v!)}.`);
  }
  const below = classRows.filter((c) => c.v! < GOAL);
  if (classRows.length) insights.push(below.length ? `${below.length} of ${classRows.length} classes are below the 90% goal; lowest is ${[...classRows].sort((a, b) => a.v! - b.v!)[0].n} at ${pct([...classRows].sort((a, b) => a.v! - b.v!)[0].v!)}.` : "Every class is at or above the 90% goal.");
  if (boys != null && girls != null && Math.abs(boys - girls) >= 0.01) insights.push(`${girls > boys ? "Girls" : "Boys"}' attendance (${pct(Math.max(boys, girls))}) is ${Math.round(Math.abs(girls - boys) * 100)} points above ${girls > boys ? "boys'" : "girls'"} (${pct(Math.min(boys, girls))}).`);
  if (chronic.length) {
    const mondayHeavy = chronic.filter(([, c]) => c.absent >= 2 && c.mondays / c.absent >= 0.5).length;
    insights.push(`${chronic.length} student${chronic.length === 1 ? " is" : "s are"} below 80% this period${mondayHeavy ? `; ${mondayHeavy} of them miss mostly Mondays` : ""}.`);
  }
  const lateMarkers = onTimeRows.filter((t) => t.r < 0.8);
  if (lateMarkers.length) insights.push(`${lateMarkers.length} teacher${lateMarkers.length === 1 ? " marks" : "s mark"} attendance before 9:00 am less than 80% of the time.`);

  const label = from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}${period === "term" && term ? ` · ${term.name}` : ""}`;
  const q = (o: Partial<Search>) => "/principal/attendance?" + new URLSearchParams(Object.entries({ period, from: period === "custom" ? from : undefined, to: period === "custom" ? to : undefined, cls: sp.cls, gender: gender || undefined, cmp, sort, ...o }).filter(([, v]) => v) as [string, string][]);
  const remindText = (s: Sec) => `Assalamu Alaikum ${s.profiles?.full_name ?? ""}, attendance for ${s.classes.name}-${s.name} isn't marked yet today (${shortDate(today)}). Please mark it in the Ilmora app. Thank you.`;
  const wa = (phone: string | null | undefined, text: string) => phone ? `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "92")}?text=${encodeURIComponent(text)}` : null;
  const empty = now.length === 0;

  return (
    <>
      <PageHead kick="Daily" title="Attendance" sub="Teachers mark it in their app. Here you see who is coming, who is slipping and what to do about it.">
        <LiveRefresh tables={["attendance"]} />
        <PrintButton />
        <Link href="/principal/reports?r=att" className="btn-ghost">Reports</Link>
      </PageHead>

      <form className="card flex flex-row flex-wrap items-end gap-3">
        <div className="flex-[1_1_100%]">
          <Chips label="Period" current={period} items={[["week", "This week"], ["month", "This month"], ["term", "This term"], ["custom", "Custom"]].map(([id, l]) => ({ id, label: l, href: q({ period: id, from: undefined, to: undefined }) }))} />
        </div>
        <input type="hidden" name="period" value={period} /><input type="hidden" name="sort" value={sort} />
        {period === "custom" && (
          <>
            <label className="field">From<input className="input" type="date" name="from" defaultValue={from} max={today} /></label>
            <label className="field">To<input className="input" type="date" name="to" defaultValue={to} max={today} /></label>
          </>
        )}
        <label className="field">Class<select className="input" name="cls" defaultValue={sp.cls ?? ""}><option value="">All classes</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field">Gender<select className="input" name="gender" defaultValue={gender}><option value="">All</option><option value="male">Boys</option><option value="female">Girls</option></select></label>
        <label className="field">Compare with<select className="input" name="cmp" defaultValue={cmp}><option value="prev">Previous period</option><option value="year">Same time last year</option><option value="goal">School goal (90%)</option></select></label>
        <button className="btn-ghost" type="submit">Apply</button>
        <span className="kick ml-auto">{label}</span>
      </form>

      <section className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {cards.map((c) => {
          const better = c.d == null || c.d === 0 ? null : c.d * c.good > 0;
          const shown = c.d == null ? null : `${c.d > 0 ? "▲" : c.d < 0 ? "▼" : "="} ${Math.abs(c.unit ? Math.round(c.d * 10) / 10 : c.d).toLocaleString("en-IN")}${c.unit}`;
          return (
            <div key={c.l} className="card">
              <div className="kick">{c.l}</div>
              <div className="mt-1.5 text-[28px] leading-9 font-black tabular-nums" style={{ color: empty ? undefined : c.tone }}>{empty ? "—" : c.v}</div>
              <div className="muted text-[13px]">
                {shown && !empty ? <><span className={better == null ? "" : better ? "text-[#15803d]" : "text-[#b91c1c]"}>{shown}</span> vs {cmpLabel}</>
                  : c.sub ?? (cmp === "goal" ? "no goal for this number" : prev.length ? "" : `no data for ${cmpLabel}`)}
              </div>
            </div>
          );
        })}
      </section>

      {notMarked.length > 0 && (
        <section className="card warm flex flex-row flex-wrap items-start gap-4" style={{ background: "#fffbeb", borderColor: "#fcd34d", boxShadow: "0 4px 0 #fcd34d" }}>
          <span className="ilm-tile t-o" style={{ width: 48, height: 48, borderRadius: 14 }}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 8v5M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg></span>
          <div className="min-w-0 flex-[1_1_300px]">
            <div className="text-[17px] font-black">Today: {notMarked.length} section{notMarked.length === 1 ? "" : "s"} not marked yet</div>
            <div className="muted text-[13px]">{marked.size ? `${marked.size} of ${secs.length} sections have marked.` : `No section has marked yet (it is ${nowHM}).`} Remind a teacher on WhatsApp:</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {notMarked.slice(0, 20).map((s) => {
                const link = wa(s.profiles?.phone, remindText(s));
                return link
                  ? <a key={s.id} href={link} target="_blank" rel="noreferrer" className="btn-ghost" style={{ minHeight: 34, padding: "0 12px", fontSize: 12, textTransform: "none" }}>{s.classes.name}-{s.name} · {s.profiles?.full_name} · Remind</a>
                  : <span key={s.id} className="tagx y">{s.classes.name}-{s.name} · {s.profiles?.full_name ?? "no class teacher"}{s.profiles && !s.profiles.phone ? " · no phone" : ""}</span>;
              })}
            </div>
          </div>
        </section>
      )}

      {empty ? <Empty>No attendance is marked for {label}{cls ? ` in ${cls.name}` : ""}{gender ? ` for ${gender === "male" ? "boys" : "girls"}` : ""}. Pick another period, or check that teachers are marking in their app.</Empty> : (
        <section className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[3_1_540px] flex-col gap-5">
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="h2">Trend · this period vs {cmp === "goal" ? "goal" : "last"}</h2>
                <span className="flex flex-wrap gap-3 text-[12px] font-extrabold text-[#4b5563]">
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#16a34a]" />This period</span>
                  {cmp !== "goal" && <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#cbd5e1]" />{cmp === "year" ? "Last year" : "Last period"}</span>}
                  <span>- - 90% goal</span>
                </span>
              </div>
              <div className="relative mt-4 flex h-[200px] items-end gap-1.5 border-b-2 border-[#e5e7eb] sm:gap-3" role="img"
                aria-label={`Attendance for ${label}${cmp !== "goal" ? ` compared with ${cmpLabel}` : ""}, against a 90% goal: ${trend.map((t) => `${t.label} ${pct(t.v)}`).join(", ")}`}>
                <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-[#ef4444]/70" style={{ bottom: h(GOAL) }}><span className="absolute -top-5 right-0 text-[11px] font-black text-[#b91c1c]">90%</span></div>
                {trend.map((t) => (
                  <div key={t.label} className="flex h-full flex-1 items-end justify-center gap-0.5" title={`${t.label}: ${pct(t.v, 1)}${t.p != null ? ` (was ${pct(t.p, 1)})` : ""}`}>
                    <div className="w-full max-w-[26px] rounded-t-[8px] rounded-b-[3px]" style={{ height: h(t.v), background: t.v >= GOAL ? "#16a34a" : "#f59e0b" }} />
                    {cmp !== "goal" && <div className="w-full max-w-[18px] rounded-t-[8px] rounded-b-[3px] bg-[#cbd5e1]" style={{ height: t.p == null ? 0 : h(t.p) }} />}
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5 sm:gap-3">{trend.map((t) => <span key={t.label} className="flex-1 text-center text-[11px] font-extrabold text-[#6b7280]">{t.label}<br /><span className="text-[#1f2937]">{pct(t.v)}</span></span>)}</div>
            </div>

            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="h2">Compare classes</h2>
                <Chips label="Sort classes" current={sort} items={[["low", "Lowest first"], ["drop", "Biggest drop"], ["class", "By class"]].map(([id, l]) => ({ id, label: l, href: q({ sort: id }) }))} />
              </div>
              <p className="muted text-[13px]">Bar is this period, black mark is {cmp === "goal" ? "the 90% goal" : cmpLabel}.</p>
              {classRows.map((c) => {
                const d = c.pv == null ? null : Math.round((c.v! - c.pv) * 100);
                const color = c.v! >= 0.95 ? "#16a34a" : c.v! >= GOAL ? "#86efac" : c.v! >= 0.85 ? "#f59e0b" : "#ef4444";
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2">
                    <span className="w-24 truncate font-black">{c.n}</span>
                    <div className="relative h-3.5 min-w-[120px] flex-1 rounded-full bg-[#eef2f7]">
                      <div className="h-full rounded-full" style={{ width: pos(c.v!), background: color }} />
                      {c.pv != null && <div className="absolute -top-1 h-[22px] w-[3px] rounded bg-[#1f2937]" style={{ left: pos(c.pv) }} title={`${cmpLabel}: ${pct(c.pv)}`} />}
                    </div>
                    <span className="w-11 text-right font-black tabular-nums">{pct(c.v!)}</span>
                    <span className={`w-9 text-right text-[13px] font-black tabular-nums ${d == null || d === 0 ? "text-[#6b7280]" : d < 0 ? "text-[#b91c1c]" : "text-[#15803d]"}`}>{d == null ? "—" : `${d > 0 ? "+" : ""}${d}`}</span>
                    <span className="muted hidden w-32 truncate text-[12px] sm:block">{c.teachers.join(", ")}</span>
                  </div>
                );
              })}
              <p className="muted mt-1 text-[11px]">Scale starts at {pct(lo)}.</p>
            </div>

            <div className="card">
              <h2 className="h2">Day-of-week pattern</h2>
              <p className="muted text-[13px]">Average attendance by weekday, last 8 weeks{cls ? ` · ${cls.name}` : ""} · all students</p>
              {heat.length === 0 ? <div className="mt-2"><Empty>Not enough marked days in the last 8 weeks.</Empty></div> : (
                <div className="mt-3 overflow-x-auto">
                  <div className="grid min-w-[380px] gap-1.5" style={{ gridTemplateColumns: `90px repeat(${hasSat ? 6 : 5}, minmax(0, 1fr))` }}>
                    <span />{WD.slice(1, hasSat ? 7 : 6).map((d) => <span key={d} className="kick text-center">{d}</span>)}
                    {heat.map((r) => (
                      <HeatRow key={r.l} label={r.l} cells={r.cells.slice(0, hasSat ? 6 : 5)} />
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-[12px] font-extrabold text-[#4b5563]">
                {[["#16a34a", "95+"], ["#86efac", "90–95"], ["#fcd34d", "80–90"], ["#fca5a5", "below 80"]].map(([c, t]) => <span key={t} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: c }} />{t}</span>)}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
            <div className="card" style={{ background: "#1f2937", color: "#fff", borderColor: "#111827", boxShadow: "0 4px 0 #111827" }}>
              <div className="kick" style={{ color: "#fcd34d" }}>Insights · from these numbers</div>
              {insights.length ? <ul className="mt-2 ml-5 flex list-disc flex-col gap-1.5 text-[14px] leading-[22px] font-bold">{insights.map((s) => <li key={s}>{s}</li>)}</ul>
                : <p className="mt-2 text-[14px] font-bold">Not enough data for insights yet.</p>}
              <Link href="/principal/notices" className="btn mt-3">Tell parents and staff</Link>
            </div>

            <div className="card">
              <h2 className="h2">Boys vs girls</h2>
              {boys == null && girls == null ? <div className="mt-2"><Empty>Gender isn&apos;t recorded for these students.</Empty></div> : (
                [["Boys", boys, "#0ea5e9"], ["Girls", girls, "#db2777"]].map(([l, v, c]) => (
                  <div key={l as string} className="flex items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2">
                    <span className="w-14 font-black">{l as string}</span>
                    <div className="h-3.5 flex-1 rounded-full bg-[#eef2f7]"><div className="h-full rounded-full" style={{ width: v == null ? 0 : pos(v as number), background: c as string }} /></div>
                    <span className="w-12 text-right font-black tabular-nums">{v == null ? "—" : pct(v as number)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <div className="flex items-center justify-between gap-2"><h2 className="h2">Chronic absentees</h2><span className="tagx r">below 80%</span></div>
              {chronic.length === 0 && <div className="mt-2"><Empty>Nobody is below 80% this period.</Empty></div>}
              {chronic.slice(0, 12).map(([id, c]) => {
                const s = info.get(id); const sec = secById.get(c.section);
                const phone = s?.families?.reminder_phone || s?.families?.phone;
                return (
                  <Row key={id}>
                    <div className="min-w-0 flex-1">
                      <Link href={`/principal/students/${id}`} className="font-black">{s?.full_name ?? "Student"}{sec ? ` · ${sec.classes.name.replace("Class ", "")}-${sec.name}` : ""}</Link>
                      <div className="muted text-[12px]">{pct(c.p / c.n)} · {c.absent} absent{c.mondays >= 2 ? ` (${c.mondays} Mondays)` : ""}{c.late ? ` · late ${c.late} time${c.late === 1 ? "" : "s"}` : ""}</div>
                    </div>
                    {phone ? <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="btn-ghost" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }}>Call</a> : <span className="muted text-[12px]">no phone</span>}
                  </Row>
                );
              })}
              {chronic.length > 12 && <Link href="/principal/students?f=absent" className="mt-2 inline-block text-[13px] font-black text-[#0369a1]">See all {chronic.length}</Link>}
            </div>

            <div className="card">
              <h2 className="h2">Teachers marking on time</h2>
              <p className="muted text-[13px]">First save before 9:00 am on the day, this period</p>
              {onTimeRows.map((t) => (
                <Row key={t.id}>
                  <span className="min-w-0 flex-1 truncate font-bold"><b className="font-black">{t.name}</b> · {t.secs.slice(0, 3).join(", ")}</span>
                  <span className="muted text-[12px]">{t.n} day{t.n === 1 ? "" : "s"}</span>
                  <span className={`tagx ${t.r >= 0.95 ? "g" : t.r >= 0.8 ? "y" : "r"}`}>{pct(t.r)}</span>
                </Row>
              ))}
              {onTimeRows.length === 0 && <div className="mt-2"><Empty>No marking recorded.</Empty></div>}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function HeatRow({ label, cells }: { label: string; cells: (number | null)[] }) {
  return (
    <>
      <span className="self-center text-[13px] font-black">{label}</span>
      {cells.map((r, i) => {
        const bg = r == null ? "#f1f5f9" : r >= 0.95 ? "#16a34a" : r >= GOAL ? "#86efac" : r >= CHRONIC ? "#fcd34d" : "#fca5a5";
        return <span key={i} className="rounded-lg py-2 text-center text-[13px] font-black tabular-nums" style={{ background: bg, color: r != null && r >= 0.95 ? "#fff" : "#1f2937" }}>{r == null ? "—" : Math.round(r * 100)}</span>;
      })}
    </>
  );
}
