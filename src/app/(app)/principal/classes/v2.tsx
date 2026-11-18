import Link from "next/link";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { pct, rupees, shortDate, todayPK, time } from "@/lib/format";
import { Insight, Empty, Bar, Row, Chips } from "@/components/ilm";
import { LEVELS, classTitle, levelLabel, loadSchool, type School } from "./data";
import { computeGaps } from "./views";
import { addRoom, assignRoom, removeRoom, saveBellSchedule, saveOverhead, saveSubjectTeacher, saveSyllabusPlan } from "./actions";
import { autoFillSection, confirmTimetable, sendTimetableForReview } from "../actions";

const sm = { minHeight: 36, padding: "0 12px", fontSize: 12 } as const;
const p = (v: number | null) => (v == null ? "—" : pct(v));
const DAY = 864e5;
type Sec = School["sections"][number];

// colour bands for the health map, same scale as the design
const band = (v: number | null, good: number, ok: number, warn: number): [string, string] =>
  v == null ? ["#f1f5f9", "#6b7280"] : v >= good ? ["#16a34a", "#fff"] : v >= ok ? ["#86efac", "#14532d"] : v >= warn ? ["#fcd34d", "#78350f"] : ["#f87171", "#7f1d1d"];

// extra numbers the v2 screens need, read once per request
const loadMore = cache(async () => {
  const supabase = await createClient();
  const today = todayPK();
  const d30 = new Date(Date.parse(today) - 30 * DAY).toISOString().slice(0, 10), d60 = new Date(Date.parse(today) - 60 * DAY).toISOString().slice(0, 10);
  const [{ data: rooms }, { data: secRooms }, { data: ss }, { data: fees }, { data: pay }, { data: settings }, recentAtt] = await Promise.all([
    supabase.from("rooms").select("id, name, kind, capacity").order("name"),
    supabase.from("sections").select("id, room_id"),
    supabase.from("section_subjects").select("section_id, subject_id, teacher_id, periods_per_week"),
    supabase.from("fee_structures").select("class_id, amount_paisa, monthly"),
    supabase.from("staff_details").select("profile_id, basic_salary_paisa, allowance_paisa"),
    supabase.from("campus_settings").select("room_overhead_paisa").maybeSingle(),
    fetchAll<{ section_id: string; date: string; present: number; marked: number }>((f, t) => supabase.from("attendance_by_section_day").select("section_id, date, present, marked").gte("date", d60).order("date").order("section_id").range(f, t) as unknown as PromiseLike<{ data: { section_id: string; date: string; present: number; marked: number }[] | null; error: unknown }>),
  ]);
  const roomOf = new Map((secRooms ?? []).map((x) => [x.id, x.room_id as string | null]));
  const monthly = new Map<string, number>();
  for (const f of fees ?? []) if (f.monthly) monthly.set(f.class_id, (monthly.get(f.class_id) ?? 0) + Number(f.amount_paisa));
  const salary = new Map((pay ?? []).map((x) => [x.profile_id, Number(x.basic_salary_paisa ?? 0) + Number(x.allowance_paisa ?? 0)]));
  const att = (sec: string, from: string, to: string) => { const r = recentAtt.filter((x) => x.section_id === sec && x.date >= from && x.date < to); const m = r.reduce((t, x) => t + x.marked, 0); return m ? r.reduce((t, x) => t + x.present, 0) / m : null; };
  const trend = (sec: string) => ({ now: att(sec, d30, "9999"), before: att(sec, d60, d30) });
  return { rooms: rooms ?? [], roomOf, subjectsOf: ss ?? [], monthly, salary, overhead: Number(settings?.room_overhead_paisa ?? 0), trend };
});

// ================= Sections =================
export async function SectionsMode({ secId, lvm, wsTab, sf }: { secId?: string; lvm?: string; wsTab?: string; sf?: string }) {
  const s = await loadSchool();
  const more = await loadMore();
  const gaps = await computeGaps(s);
  const live = s.sections;
  const lv = LEVELS.some((l) => l.id === lvm) ? lvm! : "all";
  const total = live.reduce((t, x) => t + x.students, 0), seats = live.reduce((t, x) => t + (x.capacity ?? 0), 0);
  const avg = (k: "att" | "result" | "fees") => { const v = live.filter((x) => x[k] != null && x.students); const n = v.reduce((t, x) => t + x.students, 0); return n ? v.reduce((t, x) => t + x[k]! * x.students, 0) / n : null; };
  const top = [
    ["Students", total.toLocaleString("en-IN"), `in ${live.length} sections`],
    ["Seats used", seats ? pct(total / seats) : "—", `${Math.max(0, seats - total)} empty seats`],
    ["Attendance", p(avg("att")), "this session"],
    ["Avg result", p(avg("result")), s.examCount ? "published results" : "no results yet"],
    ["Fees collected", p(avg("fees")), "this session"],
    ["Students per teacher", s.staff.filter((t) => t.role === "teacher").length ? String(Math.round(total / s.staff.filter((t) => t.role === "teacher").length)) : "—", "goal 30 or less"],
    ["Gaps to fix", String(gaps.length), "see Gaps and checks"],
  ];
  const shown = live.filter((x) => lv === "all" || x.cls.lvl === lv);
  const sel = live.find((x) => x.id === secId) ?? shown[0] ?? live[0];
  const href = (o: Record<string, string | undefined>) => "/principal/classes?" + new URLSearchParams(Object.entries({ lvm: lv === "all" ? undefined : lv, sec: sel?.id, ws: wsTab, ...o }).filter(([, v]) => v) as [string, string][]);
  const notStarted = s.classes.filter((c) => !live.some((x) => x.class_id === c.id));
  const loadOf = (tid: string | null) => (tid ? s.periodsOf.get(tid) ?? 0 : 0);
  const cells = (x: Sec) => {
    const seat = x.capacity ? x.students / x.capacity : null;
    const sc = s.score(x);
    const ld = loadOf(x.class_teacher_id);
    return [
      [seat == null ? "—" : pct(seat), seat == null ? band(null, 0, 0, 0) : seat >= 1 ? ["#f87171", "#7f1d1d"] : seat >= 0.6 ? ["#86efac", "#14532d"] : ["#fcd34d", "#78350f"], "seats"],
      [p(x.att), band(x.att, 0.95, 0.9, 0.85), "attendance"],
      [p(x.result), band(x.result, 0.8, 0.7, 0.6), "results"],
      [p(x.pass), band(x.pass, 0.95, 0.88, 0.8), "pass rate"],
      [p(x.fees), band(x.fees, 0.9, 0.85, 0.75), "fees"],
      [p(x.homework), band(x.homework, 0.88, 0.8, 0.72), "homework"],
      [x.class_teacher_id ? `${ld}p` : "none", !x.class_teacher_id ? ["#f87171", "#7f1d1d"] : ld > s.rules.max_periods_week ? ["#f87171", "#7f1d1d"] : ld >= s.rules.max_periods_week - 1 ? ["#fcd34d", "#78350f"] : ["#86efac", "#14532d"], "class teacher periods a week"],
      [sc == null ? "—" : String(sc), band(sc == null ? null : sc / 100, 0.88, 0.8, 0.72), "overall"],
    ] as [string, [string, string], string][];
  };

  return (
    <>
      <section className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        {top.map(([l, v, n]) => (
          <div key={l} className="card" style={{ padding: 14 }}><div className="kick">{l}</div><div className="mt-1 text-[24px] font-black tabular-nums" style={l === "Gaps to fix" && Number(v) ? { color: "#c2410c" } : undefined}>{v}</div><div className="muted text-[12px]">{n}</div></div>
        ))}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">School health map</h2>
          <div className="flex flex-wrap gap-3 text-[12px] font-extrabold text-[#4b5563]">
            {[["#16a34a", "Strong"], ["#86efac", "OK"], ["#fcd34d", "Watch"], ["#f87171", "Act now"]].map(([c, t]) => <span key={t} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: c }} />{t}</span>)}
            <span>Click a row to open that section</span>
          </div>
        </div>
        <div className="mt-3"><Chips label="Show level" current={lv} items={[{ id: "all", label: "All" }, ...LEVELS.map((l) => ({ id: l.id, label: l.label }))].map((x) => ({ ...x, href: href({ lvm: x.id === "all" ? undefined : x.id, sec: undefined }) }))} /></div>
        {shown.length === 0 ? (
          <div className="mt-3 rounded-[14px] border-2 border-[#fcd34d] bg-[#fffbeb] p-3"><div className="font-black">No sections at this level yet</div>
            <div className="muted text-[13px]">Add Class 11 groups (FSc, ICS, FA, I.Com) or a BS program from &ldquo;Add class or program&rdquo; below.{notStarted.filter((c) => c.lvl === lv).length ? ` Not started: ${notStarted.filter((c) => c.lvl === lv).map(classTitle).join(", ")}.` : ""}</div></div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <div className="grid min-w-[760px] gap-1.5" style={{ gridTemplateColumns: "150px repeat(8, minmax(0, 1fr))" }}>
              <span />{["Seats", "Attend.", "Results", "Pass", "Fees", "Homework", "Teacher", "Overall"].map((h) => <span key={h} className="kick text-center">{h}</span>)}
              {shown.map((x) => (
                <MapRow key={x.id} x={x} cells={cells(x)} on={x.id === sel?.id} href={href({ sec: x.id })} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-start gap-5">
        <div className="card flex min-w-0 flex-[1_1_220px] flex-col gap-1 lg:max-w-[260px]">
          {LEVELS.filter((l) => s.classes.some((c) => c.lvl === l.id)).map((l) => (
            <div key={l.id} className="mb-2">
              <div className="kick mb-1">{l.label}</div>
              {live.filter((x) => x.cls.lvl === l.id).map((x) => {
                const sc = s.score(x);
                return (
                  <Link key={x.id} href={href({ sec: x.id, lvm: lv === "all" ? undefined : lv })} scroll={false} aria-current={x.id === sel?.id ? "true" : undefined}
                    className={`flex items-center gap-2 rounded-[12px] border-2 px-2 py-1.5 text-[14px] font-extrabold ${x.id === sel?.id ? "border-[#7dd3fc] bg-[#e0f2fe] text-[#0369a1]" : "border-transparent hover:bg-[#f1f5f9]"}`}>
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: band(sc == null ? null : sc / 100, 0.88, 0.8, 0.72)[0] }} />
                    <span className="flex-1 truncate">{classTitle(x.cls).replace(/^Class /, "")}-{x.name}</span><span className="muted text-[12px]">{x.students}</span>
                  </Link>
                );
              })}
              {notStarted.filter((c) => c.lvl === l.id).map((c) => (
                <Link key={c.id} href={`/principal/classes?tab=classes&class=${c.id}`} className="flex items-center gap-2 px-2 py-1 text-[13px] font-bold text-[#6b7280]"><span className="h-2.5 w-2.5 rounded-full bg-[#e5e7eb]" />{classTitle(c)} · not started</Link>
              ))}
            </div>
          ))}
          <Link href="/principal/classes?tab=classes#add-class" className="btn-ghost mt-1" style={sm}>Add class or program</Link>
        </div>
        <div className="min-w-0 flex-[4_1_560px]">{sel ? <Workspace s={s} x={sel} more={more} wsTab={wsTab} sf={sf} href={href} /> : <Empty>No sections yet. Add a class with a section first.</Empty>}</div>
      </section>
    </>
  );
}

function MapRow({ x, cells, on, href }: { x: Sec; cells: [string, [string, string], string][]; on: boolean; href: string }) {
  return (
    <>
      <Link href={href} scroll={false} className={`truncate self-center text-[13px] font-black ${on ? "text-[#0369a1]" : ""}`}>{classTitle(x.cls)}-{x.name}</Link>
      {cells.map(([v, [bg, fg], a]) => (
        <Link key={a} href={href} scroll={false} aria-label={`${classTitle(x.cls)}-${x.name} ${a} ${v}`} className="rounded-[10px] py-2 text-center text-[12px] font-black tabular-nums"
          style={{ background: bg, color: fg, outline: on ? "3px solid #0369a1" : "none" }}>{v}</Link>
      ))}
    </>
  );
}

// ---------- the section workspace ----------
async function Workspace({ s, x, more, wsTab, sf, href }: { s: School; x: Sec; more: Awaited<ReturnType<typeof loadMore>>; wsTab?: string; sf?: string; href: (o: Record<string, string | undefined>) => string }) {
  const tab = ["over", "students", "teach", "tt", "syl", "results", "money"].includes(wsTab ?? "") ? wsTab! : "over";
  const sc = s.score(x);
  const ranked = [...s.sections].filter((q) => s.score(q) != null).sort((a, b) => (s.score(b) ?? 0) - (s.score(a) ?? 0));
  const rank = ranked.findIndex((q) => q.id === x.id) + 1;
  const room = more.rooms.find((r) => r.id === more.roomOf.get(x.id));
  const back = href({ sec: x.id, ws: tab });
  const [c1, c2] = band(sc == null ? null : sc / 100, 0.88, 0.8, 0.72);
  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="kick">{levelLabel(x.cls.lvl)}</div><h2 className="mt-1 text-[24px] font-black">{classTitle(x.cls)}-{x.name}</h2>
          <div className="muted text-[13px]">Class teacher <b className="text-[#1f2937]">{x.class_teacher_id ? s.teacherName.get(x.class_teacher_id) ?? "—" : "none"}</b> · {room ? `Room ${room.name}` : "no room"}{x.cls.board ? ` · ${x.cls.board}` : ""}</div></div>
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full text-[22px] font-black" style={{ background: c1, color: c2 }}>{sc ?? "—"}</div>
          <div><div className="font-black">Health score</div><div className="muted text-[12px]">{rank ? `#${rank} of ${ranked.length} sections` : "not enough data"}</div></div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[["t-g", "+", "Add student", "/principal/admissions"], ["t-b", "↗", "Promote class", `/principal/classes?tab=promote&section=${x.id}`], ["t-v", "⇄", "Move students", `/principal/classes?tab=move&from=${x.id}`],
          ["t-o", "T", "Assign teachers", href({ sec: x.id, ws: "teach" })], ["t-p", "@", "Message parents", "/principal/notices"], ["t-n", "P", "Print list", `/print/report-cards?section=${x.id}`]].map(([t, i, l, h]) => (
          <Link key={l} href={h} className="flex flex-col items-center gap-1.5 rounded-[14px] border-2 border-[#e5e7eb] bg-white p-2.5 text-center text-[12px] font-extrabold shadow-[0_3px_0_#e5e7eb] hover:border-[#7dd3fc]">
            <span className={`ilm-tile ${t} font-black`}>{i}</span>{l}</Link>
        ))}
      </div>
      <nav className="flex flex-wrap gap-1 border-b-2 border-[#e5e7eb]">
        {[["over", "Overview"], ["students", "Students"], ["teach", "Subjects & teachers"], ["tt", "Timetable"], ["syl", "Syllabus"], ["results", "Results"], ["money", "Fees"]].map(([id, l]) => (
          <Link key={id} href={href({ sec: x.id, ws: id })} scroll={false} aria-current={id === tab ? "page" : undefined}
            className={`-mb-0.5 border-b-4 px-3 py-2 text-[14px] font-black ${id === tab ? "border-[#38bdf8] text-[#0369a1]" : "border-transparent text-[#6b7280]"}`}>{l}</Link>
        ))}
      </nav>
      {tab === "over" && <Overview s={s} x={x} more={more} />}
      {tab === "students" && <Students x={x} sf={sf} href={(f) => href({ sec: x.id, ws: "students", sf: f })} />}
      {tab === "teach" && <Teach s={s} x={x} more={more} back={back} />}
      {tab === "tt" && <Timetable s={s} x={x} more={more} />}
      {tab === "syl" && <Syllabus s={s} x={x} back={back} />}
      {tab === "results" && <Results x={x} />}
      {tab === "money" && <Money x={x} />}
    </div>
  );
}

async function Overview({ s, x, more }: { s: School; x: Sec; more: Awaited<ReturnType<typeof loadMore>> }) {
  const supabase = await createClient();
  const { data: kids } = await supabase.from("students").select("gender").eq("section_id", x.id).eq("status", "enrolled");
  const boys = (kids ?? []).filter((k) => k.gender === "male").length, girls = (kids ?? []).filter((k) => k.gender === "female").length;
  const t = more.trend(x.id);
  const d = t.now != null && t.before != null ? Math.round((t.now - t.before) * 100) : null;
  const kp = [["Attendance", p(x.att), d == null ? "" : `${d >= 0 ? "▲" : "▼"} ${Math.abs(d)} pts, last 30 days`], ["Avg result", p(x.result), "published results"], ["Pass rate", p(x.pass), `pass mark ${s.rules.pass_mark}%`],
    ["Fees collected", p(x.fees), "this session"], ["Homework done", p(x.homework), "submitted"], ["Teachers", String(x.teachers), x.teachers ? `${Math.round(x.students / x.teachers)} students each` : "none assigned"]];
  const todo = [
    x.att != null && x.att < 0.9 ? `Attendance is ${pct(x.att)}: call the parents of students below 80% (Attendance page).` : "",
    x.result != null && x.result < 0.6 ? `Results average ${pct(x.result)}: add weekly tests and an extra period for the weakest subject.` : "",
    x.fees != null && x.fees < 0.85 ? `Only ${pct(x.fees)} of fees collected: send reminders to families with a balance.` : "",
    !x.class_teacher_id ? "No class teacher: assign one so attendance and parents have an owner." : "",
    x.slots === 0 ? "No timetable yet: fill it on the Timetable tab." : "",
    x.capacity && x.students >= x.capacity ? "Section is full: open another section before new admissions." : "",
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="grid min-w-0 flex-[3_1_380px] gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {kp.map(([l, v, n]) => <div key={l} className="rounded-[14px] border-2 border-[#e5e7eb] p-3"><div className="kick">{l}</div><div className="text-[22px] font-black tabular-nums">{v}</div><div className="muted text-[12px]">{n}</div></div>)}
      </div>
      <div className="flex min-w-0 flex-[2_1_260px] flex-col gap-3">
        <Insight title="What to do this week">{todo.length ? <ol className="ml-5 list-decimal">{todo.slice(0, 4).map((t) => <li key={t}>{t}</li>)}</ol> : "Nothing urgent: every number is in a healthy range."}</Insight>
        <div className="rounded-[14px] border-2 border-[#e5e7eb] p-3"><div className="kick">Seats</div><div className="text-[22px] font-black">{x.students} / {x.capacity ?? "—"}</div>
          <Bar value={x.capacity ? x.students / x.capacity : 0} color={x.capacity && x.students >= x.capacity ? "#ef4444" : "#16a34a"} />
          <div className="muted mt-1 text-[12px]">{boys} boys · {girls} girls{x.students - boys - girls ? ` · ${x.students - boys - girls} not recorded` : ""}</div></div>
      </div>
    </div>
  );
}

async function Students({ x, sf, href }: { x: Sec; sf?: string; href: (f?: string) => string }) {
  const supabase = await createClient();
  const { data: kids } = await supabase.from("students").select("id, full_name, roll_no, admission_no, family_id").eq("section_id", x.id).eq("status", "enrolled").order("roll_no").order("full_name");
  const ids = (kids ?? []).map((k) => k.id);
  const since = new Date(Date.now() - 90 * DAY).toISOString().slice(0, 10);
  const [att, { data: bal }] = await Promise.all([
    ids.length ? fetchAll<{ student_id: string; status: string }>((f, t) => supabase.from("attendance").select("student_id, status").in("student_id", ids).gte("date", since).order("id").range(f, t) as unknown as PromiseLike<{ data: { student_id: string; status: string }[] | null; error: unknown }>) : Promise.resolve([]),
    supabase.from("family_balances").select("family_id, balance_paisa").in("family_id", [...new Set((kids ?? []).map((k) => k.family_id).filter(Boolean))] as string[]),
  ]);
  const s = await loadSchool();
  const owe = new Map((bal ?? []).map((b) => [b.family_id, Number(b.balance_paisa)]));
  const rows = (kids ?? []).map((k) => {
    const a = att.filter((r) => r.student_id === k.id);
    const ar = a.length ? a.filter((r) => r.status === "present" || r.status === "late").length / a.length : null;
    const m = s.stuAvg.get(k.id); const avg = m?.rs.length ? m.rs.reduce((t, v) => t + v, 0) / m.rs.length : null;
    const due = k.family_id ? owe.get(k.family_id) ?? 0 : 0;
    const flag = ar != null && ar < 0.8 ? ["Low attendance", "r"] : avg != null && avg < 0.5 ? ["Low marks", "y"] : due > 0 ? ["Fee due", "y"] : ["Good", "g"];
    return { ...k, ar, avg, due, flag };
  });
  const f = ["absent", "low", "fees"].includes(sf ?? "") ? sf! : "all";
  const list = rows.filter((r) => f === "all" || (f === "absent" ? r.ar != null && r.ar < 0.8 : f === "low" ? r.avg != null && r.avg < 0.5 : r.due > 0));
  return (
    <div className="flex flex-col gap-2">
      <Chips label="Filter" current={f} items={[["all", `All (${rows.length})`], ["absent", "Below 80% attendance"], ["low", "Below 50% marks"], ["fees", "Fee due"]].map(([id, label]) => ({ id, label, href: href(id === "all" ? undefined : id) }))} />
      {list.length === 0 ? <Empty>No student matches.</Empty> : (
        <div className="tbl overflow-x-auto"><table className="w-full min-w-[600px]">
          <thead><tr>{["Roll", "Student", "Attendance", "Average", "Fee", "Flag", ""].map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.id}><td className="tabular-nums">{r.roll_no ?? "—"}</td><td><b>{r.full_name}</b><span className="muted block text-[11px]">{r.admission_no}</span></td>
              <td className="tabular-nums">{p(r.ar)}</td><td className="tabular-nums">{p(r.avg)}</td><td className="tabular-nums">{r.due > 0 ? rupees(r.due) : "Paid"}</td>
              <td><span className={`tagx ${r.flag[1]}`}>{r.flag[0]}</span></td><td><Link href={`/principal/students/${r.id}`} className="btn-ghost" style={sm}>Open</Link></td></tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="muted text-[12px]">Attendance over the last 90 days; average of published marks this session; fee is the family&apos;s balance.</p>
    </div>
  );
}

async function Teach({ s, x, more, back }: { s: School; x: Sec; more: Awaited<ReturnType<typeof loadMore>>; back: string }) {
  const supabase = await createClient();
  const { data: slots } = await supabase.from("timetable_slots").select("subject_id").eq("section_id", x.id);
  const got = new Map<string, number>();
  for (const t of slots ?? []) got.set(t.subject_id, (got.get(t.subject_id) ?? 0) + 1);
  const rows = more.subjectsOf.filter((q) => q.section_id === x.id);
  const teachers = s.staff;
  return (
    <div className="flex flex-col gap-1">
      {rows.length === 0 && <Empty>No subjects set for this section yet. Add one below.</Empty>}
      {[...rows, { section_id: x.id, subject_id: "", teacher_id: null, periods_per_week: null }].map((r) => {
        const sub = s.subjects.find((q) => q.id === r.subject_id);
        const load = r.teacher_id ? s.periodsOf.get(r.teacher_id) ?? 0 : 0;
        const tag = !r.subject_id ? null : !r.teacher_id ? ["No teacher", "r"] : load > s.rules.max_periods_week ? ["Overloaded", "y"] : ["OK", "g"];
        return (
          <form key={r.subject_id || "new"} action={saveSubjectTeacher}>
            <Row>
              <input type="hidden" name="section_id" value={x.id} /><input type="hidden" name="back" value={back} />
              {r.subject_id ? <><input type="hidden" name="subject_id" value={r.subject_id} /><span className="w-36 font-black">{sub?.name ?? "Subject"}</span></>
                : <select className="input w-36" style={{ minHeight: 36 }} name="subject_id" required aria-label="Subject"><option value="">Add subject…</option>{s.subjects.filter((q) => !rows.some((r2) => r2.subject_id === q.id)).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</select>}
              <select className="input min-w-[150px] flex-1" style={{ minHeight: 36 }} name="teacher_id" defaultValue={r.teacher_id ?? ""} aria-label="Teacher"><option value="">No teacher</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select>
              <label className="flex items-center gap-1.5 text-[12px] font-bold">Periods/wk<input className="input w-16" style={{ minHeight: 36 }} type="number" min={0} max={60} name="periods_per_week" defaultValue={r.periods_per_week ?? ""} /></label>
              {r.subject_id && <span className="muted w-32 text-[12px]">{got.get(r.subject_id) ?? 0} on timetable · load {load}</span>}
              {tag && <span className={`tagx ${tag[1]}`}>{tag[0]}</span>}
              <button className="btn-ghost" style={sm} type="submit">{r.subject_id ? "Save" : "Add"}</button>
            </Row>
          </form>
        );
      })}
      <p className="muted mt-1 text-[12px]">Load = the teacher&apos;s periods a week across the school (limit {s.rules.max_periods_week}).</p>
    </div>
  );
}

async function Timetable({ s, x, more }: { s: School; x: Sec; more: Awaited<ReturnType<typeof loadMore>> }) {
  const supabase = await createClient();
  const [{ data: periods }, { data: slots }, { data: round }] = await Promise.all([
    supabase.from("periods").select("id, name, starts_at, sort, timing_profiles!inner(is_active, name)").eq("timing_profiles.is_active", true).eq("kind", "class").order("sort"),
    supabase.from("timetable_slots").select("weekday, period_id, subject_id, teacher_id, subjects(name), profiles(full_name)").eq("section_id", x.id),
    supabase.from("timetable_rounds").select("status").neq("status", "replaced").order("sent_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  type Sl = { weekday: number; period_id: string; subject_id: string; teacher_id: string | null; subjects: { name: string } | null; profiles: { full_name: string } | null };
  const list = (slots ?? []) as unknown as Sl[];
  const at = new Map(list.map((q) => [`${q.weekday}-${q.period_id}`, q]));
  const days = list.some((q) => q.weekday === 6) ? 6 : 5;
  const subj = more.subjectsOf.filter((q) => q.section_id === x.id);
  // problems: a period with no teacher, or a teacher who isn't the subject's teacher for this section
  const problems = list.filter((q) => !q.teacher_id || (subj.find((r) => r.subject_id === q.subject_id)?.teacher_id && subj.find((r) => r.subject_id === q.subject_id)!.teacher_id !== q.teacher_id));
  const need = subj.filter((q) => q.periods_per_week).map((q) => ({ n: s.subjects.find((z) => z.id === q.subject_id)?.name ?? "", want: q.periods_per_week!, got: list.filter((l) => l.subject_id === q.subject_id).length }));
  const prof = (periods ?? [])[0] as unknown as { timing_profiles: { name: string } } | undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`tagx ${problems.length ? "r" : "g"}`}>{problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"}` : "No clashes"}</span>
        <span className="muted text-[12px]">{prof ? `${prof.timing_profiles.name} timings` : "no bell timing in use"} · {(periods ?? []).length} periods · {round?.status === "review" ? "sent to teachers" : round ? "published" : "not published"}</span>
        <span className="flex-1" />
        <form action={autoFillSection}><input type="hidden" name="section_id" value={x.id} /><button className="btn-ghost" style={sm} type="submit">{problems.length || !list.length ? "Fill free periods" : "Fill gaps"}</button></form>
        <form action={sendTimetableForReview}><input type="hidden" name="message" value="" /><button className="btn-ghost" style={sm} type="submit">Send to teachers</button></form>
        <form action={confirmTimetable}><button className="btn" style={sm} type="submit">Publish to parents</button></form>
      </div>
      {(periods ?? []).length === 0 ? <Empty>No bell timing in use. Set one on the Bell timings tab.</Empty> : (
        <div className="overflow-x-auto"><div className="grid min-w-[640px] gap-1.5" style={{ gridTemplateColumns: `80px repeat(${days}, minmax(90px, 1fr))` }}>
          <span />{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].slice(0, days).map((d) => <span key={d} className="kick text-center">{d}</span>)}
          {(periods ?? []).map((pr) => (
            <TRow key={pr.id} label={pr.name} t={time(pr.starts_at)}>
              {Array.from({ length: days }, (_, i) => {
                const c = at.get(`${i + 1}-${pr.id}`);
                const bad = c && problems.includes(c);
                return <div key={i} className="min-h-12 rounded-[10px] p-1.5 text-center text-[12px] font-extrabold" style={c ? { background: bad ? "#fee2e2" : "#e0f2fe", color: bad ? "#b91c1c" : "#075985" } : { border: "2px dashed #e5e7eb", color: "#9ca3af" }}>
                  {c ? <>{c.subjects?.name}<div className="text-[11px] font-bold opacity-80">{c.profiles?.full_name ?? "No teacher"}</div></> : "Free"}</div>;
              })}
            </TRow>
          ))}
        </div></div>
      )}
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[1_1_300px]">
          <div className="kick mb-1">Periods a week vs required</div>
          {need.length === 0 && <p className="muted text-[13px]">Set how many periods each subject needs in Subjects &amp; teachers.</p>}
          {need.map((n) => (
            <div key={n.n} className="flex items-center gap-2 py-1"><span className="w-28 truncate text-[13px] font-bold">{n.n}</span><div className="flex-1"><Bar value={n.got / n.want} color={n.got >= n.want ? "#16a34a" : n.got === 0 ? "#ef4444" : "#f59e0b"} /></div><span className="w-12 text-right text-[13px] font-black tabular-nums">{n.got}/{n.want}</span></div>
          ))}
        </div>
        <div className="min-w-0 flex-[1_1_260px] rounded-[14px] border-2 border-[#e5e7eb] p-3 text-[13px]">
          <div className="font-black">How it works</div>
          <p className="muted">&ldquo;Fill free periods&rdquo; places each subject teacher in empty periods and never books a teacher twice (the database refuses a clash). Red cells have no teacher or a teacher who isn&apos;t this subject&apos;s teacher. To set one period, use the <Link className="text-[#0369a1] underline" href={`/principal/classes?tab=timetable&section=${x.id}`}>full timetable editor</Link>.</p>
        </div>
      </div>
    </div>
  );
}

function TRow({ label, t, children }: { label: string; t: string; children: React.ReactNode }) {
  return (<><span className="self-center text-[12px] font-black">{label}<br /><span className="muted font-bold">{t}</span></span>{children}</>);
}

async function Syllabus({ s, x, back }: { s: School; x: Sec; back: string }) {
  const supabase = await createClient();
  const [{ data: plans }, { data: diary }] = await Promise.all([
    supabase.from("syllabus_plans").select("subject_id, chapters, starts_on, ends_on").eq("class_id", x.class_id),
    supabase.from("lesson_diary").select("subject_id, topic, date").eq("section_id", x.id),
  ]);
  const today = todayPK();
  const subjects = [...new Set([...s.secSubjects.filter((q) => q.section_id === x.id).map((q) => q.subject_id), ...(plans ?? []).map((q) => q.subject_id)])];
  const rows = subjects.map((id) => {
    const plan = (plans ?? []).find((q) => q.subject_id === id);
    const entries = (diary ?? []).filter((d) => d.subject_id === id);
    // furthest chapter the diary mentions ("Chapter 5: ...", "Ch 5", "Unit 5")
    const reached = Math.max(0, ...entries.map((d) => Number((d.topic.match(/(?:chapter|ch\.?|unit)\s*(\d+)/i) ?? [])[1] ?? 0)));
    const done = plan ? Math.min(1, reached / plan.chapters) : null;
    const should = plan ? Math.min(1, Math.max(0, (Date.parse(today) - Date.parse(plan.starts_on)) / (Date.parse(plan.ends_on) - Date.parse(plan.starts_on)))) : null;
    return { id, n: s.subjects.find((q) => q.id === id)?.name ?? "", plan, entries: entries.length, reached, done, should };
  });
  const year = s.year;
  return (
    <div className="flex flex-col gap-2">
      <p className="muted text-[13px]">From teachers&apos; lesson diary (the highest chapter number written) against where the plan says the class should be today.</p>
      {rows.length === 0 && <Empty>No subjects for this section yet.</Empty>}
      {rows.map((r) => {
        const gap = r.done != null && r.should != null ? r.done - r.should : null;
        const tag = gap == null ? null : gap >= 0 ? ["On track", "g"] : gap >= -0.08 ? ["Slightly behind", "y"] : ["Behind", "r"];
        return (
          <form key={r.id} action={saveSyllabusPlan}>
            <Row>
              <input type="hidden" name="class_id" value={x.class_id} /><input type="hidden" name="subject_id" value={r.id} /><input type="hidden" name="back" value={back} />
              <span className="w-28 truncate font-black">{r.n}</span>
              <div className="relative h-3.5 min-w-[120px] flex-1 rounded-full bg-[#eef2f7]">
                <div className="h-full rounded-full" style={{ width: `${(r.done ?? 0) * 100}%`, background: tag?.[1] === "r" ? "#ef4444" : tag?.[1] === "y" ? "#f59e0b" : "#16a34a" }} />
                {r.should != null && <div className="absolute -top-1 h-[22px] w-[3px] rounded bg-[#1f2937]" style={{ left: `${r.should * 100}%` }} />}
              </div>
              <span className="w-28 text-[12px] font-bold">{r.plan ? `ch ${r.reached} of ${r.plan.chapters}` : `${r.entries} diary entr${r.entries === 1 ? "y" : "ies"}`}</span>
              {tag ? <span className={`tagx ${tag[1]}`}>{tag[0]}</span> : <span className="tagx">No plan</span>}
              <input className="input w-16" style={{ minHeight: 34 }} type="number" min={1} name="chapters" defaultValue={r.plan?.chapters ?? ""} placeholder="ch." aria-label="Chapters" required />
              <input className="input w-36" style={{ minHeight: 34 }} type="date" name="starts_on" defaultValue={r.plan?.starts_on ?? year?.starts_on ?? ""} aria-label="Start" required />
              <input className="input w-36" style={{ minHeight: 34 }} type="date" name="ends_on" defaultValue={r.plan?.ends_on ?? year?.ends_on ?? ""} aria-label="Finish" required />
              <button className="btn-ghost" style={sm} type="submit">{r.plan ? "Save" : "Set plan"}</button>
            </Row>
          </form>
        );
      })}
      <p className="muted text-[12px]">Black mark = where the plan says the class should be today.</p>
    </div>
  );
}

async function Results({ x }: { x: Sec }) {
  const supabase = await createClient();
  const { data: exams } = await supabase.from("exams").select("id, total_marks, terms!inner(academic_sessions!inner(is_current))").eq("status", "results").eq("terms.academic_sessions.is_current", true);
  const tm = new Map((exams ?? []).map((e) => [e.id, e.total_marks || 100]));
  const { data: kids } = await supabase.from("students").select("id").eq("section_id", x.id).eq("status", "enrolled");
  const ids = (kids ?? []).map((k) => k.id);
  const marks = tm.size && ids.length ? await fetchAll<{ student_id: string; exam_id: string; obtained: number; subjects: { name: string } }>((f, t) => supabase.from("marks").select("student_id, exam_id, obtained, subjects(name)").in("exam_id", [...tm.keys()]).in("student_id", ids).eq("is_absent", false).not("obtained", "is", null).order("id").range(f, t) as unknown as PromiseLike<{ data: { student_id: string; exam_id: string; obtained: number; subjects: { name: string } }[] | null; error: unknown }>) : [];
  if (!marks.length) return <Empty>No published results for this section this session.</Empty>;
  const bySub = new Map<string, number[]>(), byStu = new Map<string, number[]>();
  for (const m of marks) { const r = Number(m.obtained) / (tm.get(m.exam_id) ?? 100); bySub.set(m.subjects.name, [...(bySub.get(m.subjects.name) ?? []), r]); byStu.set(m.student_id, [...(byStu.get(m.student_id) ?? []), r]); }
  const av = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const subs = [...bySub.entries()].map(([n, v]) => ({ n, r: av(v) })).sort((a, b) => b.r - a.r);
  const G = [["A+", 0.8], ["A", 0.7], ["B", 0.6], ["C", 0.5], ["D", 0.4], ["F", 0]] as const;
  const studs = [...byStu.values()].map(av);
  const spread = G.map(([g, min], i) => ({ g, n: studs.filter((r) => r >= min && (i === 0 || r < G[i - 1][1])).length }));
  const max = Math.max(1, ...spread.map((q) => q.n));
  return (
    <div className="flex flex-wrap gap-5">
      <div className="min-w-0 flex-[3_1_320px]"><div className="kick mb-1">Subject averages · this session</div>
        {subs.map((q) => <div key={q.n} className="flex items-center gap-2 py-1"><span className="w-28 truncate text-[13px] font-bold">{q.n}</span><div className="flex-1"><Bar value={q.r} color={q.r >= 0.7 ? "#16a34a" : q.r >= 0.5 ? "#f59e0b" : "#ef4444"} /></div><span className="w-11 text-right text-[13px] font-black">{pct(q.r)}</span></div>)}</div>
      <div className="min-w-0 flex-[2_1_220px]"><div className="kick mb-1">Grade spread · {studs.length} students</div>
        {spread.map((q) => <div key={q.g} className="flex items-center gap-2 py-1"><span className="w-8 font-black">{q.g}</span><div className="flex-1"><Bar value={q.n / max} color={q.g === "F" ? "#ef4444" : "#16a34a"} /></div><span className="w-8 text-right font-black">{q.n}</span></div>)}</div>
    </div>
  );
}

async function Money({ x }: { x: Sec }) {
  const supabase = await createClient();
  const s = await loadSchool();
  const since = s.year?.starts_on ?? "1900-01-01";
  const lines = await fetchAll<{ amount_paisa: number; invoices: { id: string; family_id: string; billing_month: string; payments: { amount_paisa: number }[] } }>((f, t) =>
    supabase.from("invoice_lines").select("amount_paisa, invoices!inner(id, family_id, billing_month, payments(amount_paisa)), students!inner(section_id)").eq("students.section_id", x.id).gte("invoices.billing_month", since).order("id").range(f, t) as unknown as PromiseLike<{ data: { amount_paisa: number; invoices: { id: string; family_id: string; billing_month: string; payments: { amount_paisa: number }[] } }[] | null; error: unknown }>);
  const billed = lines.filter((l) => Number(l.amount_paisa) > 0).reduce((t, l) => t + Number(l.amount_paisa), 0);
  const disc = -lines.filter((l) => Number(l.amount_paisa) < 0).reduce((t, l) => t + Number(l.amount_paisa), 0);
  const fams = [...new Set(lines.map((l) => l.invoices.family_id))];
  const { data: bal } = fams.length ? await supabase.from("family_balances").select("family_id, balance_paisa").in("family_id", fams).gt("balance_paisa", 0) : { data: [] };
  const cards = [["Billed this session", rupees(billed)], ["Collected", x.fees != null ? `${pct(x.fees)} · ${rupees(Math.round(billed * (x.fees ?? 0)))}` : "—"], ["Families with balance", `${(bal ?? []).length} of ${fams.length}`], ["Discounts", rupees(disc)]];
  if (!lines.length) return <Empty>No challans for this section this session.</Empty>;
  return <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>{cards.map(([l, v]) => <div key={l} className="rounded-[14px] border-2 border-[#e5e7eb] p-3"><div className="kick">{l}</div><div className="text-[20px] font-black">{v}</div></div>)}</div>;
}

// ================= Classrooms =================
export async function RoomsMode({ sort }: { sort?: string }) {
  const s = await loadSchool();
  const more = await loadMore();
  const secByRoom = new Map<string, Sec[]>();
  for (const x of s.sections) { const r = more.roomOf.get(x.id); if (r) secByRoom.set(r, [...(secByRoom.get(r) ?? []), x]); }
  const teacherTotal = s.periodsOf;
  const supabase = await createClient();
  const { data: slots } = await supabase.from("timetable_slots").select("section_id, teacher_id");
  const perSecTeacher = new Map<string, Map<string, number>>();
  for (const t of slots ?? []) if (t.teacher_id) { const m = perSecTeacher.get(t.section_id) ?? new Map(); m.set(t.teacher_id, (m.get(t.teacher_id) ?? 0) + 1); perSecTeacher.set(t.section_id, m); }
  const secMoney = (x: Sec) => {
    const fee = more.monthly.get(x.class_id) ?? 0;
    const income = x.students * fee * (x.fees ?? 1);
    let teach = 0;
    for (const [tid, n] of perSecTeacher.get(x.id) ?? []) teach += (more.salary.get(tid) ?? 0) * n / Math.max(1, teacherTotal.get(tid) ?? n);
    return { income, teach, fee };
  };
  const rows = more.rooms.map((r) => {
    const secs = secByRoom.get(r.id) ?? [];
    const students = secs.reduce((t, x) => t + x.students, 0);
    const m = secs.map(secMoney);
    const income = m.reduce((t, q) => t + q.income, 0), cost = m.reduce((t, q) => t + q.teach, 0) + more.overhead;
    const cap = r.capacity ?? secs.reduce((t, x) => t + (x.capacity ?? 0), 0);
    return { ...r, secs, students, cap, empty: Math.max(0, cap - students), income, cost, profit: income - cost, per: students ? (income - cost) / students : null, noFee: secs.some((x) => !more.monthly.get(x.class_id)) };
  });
  const unroomed = s.sections.filter((x) => !more.roomOf.get(x.id));
  const key = ["profit", "empty", "losing", "type"].includes(sort ?? "") ? sort! : "profit";
  const list = (key === "losing" ? rows.filter((r) => r.profit < 0) : [...rows]).sort((a, b) => key === "empty" ? b.empty - a.empty : key === "type" ? a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) : key === "losing" ? a.profit - b.profit : b.profit - a.profit);
  const seats = rows.reduce((t, r) => t + r.cap, 0), used = rows.reduce((t, r) => t + r.students, 0);
  const avgFee = s.sections.length ? s.sections.reduce((t, x) => t + secMoney(x).fee * (x.fees ?? 1), 0) / s.sections.length : 0;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.profit)));
  const tips = [
    ...rows.filter((r) => r.cap && r.students > r.cap).map((r) => `${r.name} holds ${r.students} students in ${r.cap} seats: move ${r.secs.map((x) => `${classTitle(x.cls)}-${x.name}`).join(", ")} to a bigger room.`),
    ...rows.filter((r) => r.secs.length === 0).slice(0, 2).map((r) => `${r.name} is empty: it costs the room overhead with no fee income. Use it for a new section or Class 11.`),
    ...rows.filter((r) => r.profit < 0 && r.secs.length).slice(0, 2).map((r) => `${r.name} loses ${rupees(-Math.round(r.profit))} a month: ${r.empty} empty seats; more admissions or merging sections would fix it.`),
    ...(more.overhead === 0 ? ["Set the room overhead (rent, power, cleaning per room) below so costs are complete."] : []),
    ...(rows.some((r) => r.noFee) ? ["Some classes have no monthly fee set, so their income shows as zero. Set fees under Fees → Fees and challans."] : []),
  ];
  return (
    <>
      <section className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {[["Classrooms", String(rows.length), `${rows.filter((r) => r.kind === "classroom").length} classrooms · ${rows.filter((r) => r.kind === "lab").length} labs · ${rows.filter((r) => r.kind === "other").length} other`],
          ["In use", String(rows.filter((r) => r.secs.length).length), `${rows.filter((r) => !r.secs.length).length} free rooms`],
          ["Seats used", seats ? pct(used / seats) : "—", `${Math.max(0, seats - used)} empty seats`],
          ["Lost revenue", rupees(Math.round(Math.max(0, seats - used) * avgFee)), "a month from empty seats"],
          ["Profit / month", rupees(Math.round(rows.reduce((t, r) => t + r.profit, 0))), "all rooms after costs"]].map(([l, v, n]) => (
          <div key={l} className="card" style={{ padding: 14 }}><div className="kick">{l}</div><div className="mt-1 text-[22px] font-black tabular-nums">{v}</div><div className="muted text-[12px]">{n}</div></div>
        ))}
      </section>
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Classrooms · who sits where and what each room earns</h2>
          <Chips label="Sort rooms" current={key} items={[["profit", "Most profit"], ["empty", "Most empty"], ["losing", "Losing money"], ["type", "By type"]].map(([id, label]) => ({ id, label, href: `/principal/classes?tab=rooms&sort=${id}` }))} />
        </div>
        {rows.length === 0 ? <div className="mt-2"><Empty>No rooms yet. Add your classrooms and labs below, then give each section a room.</Empty></div> : (
          <div className="tbl mt-2 overflow-x-auto"><table className="w-full min-w-[960px]">
            <thead><tr>{["Classroom", "Type", "Section", "Seats used", "Empty", "Fee income", "Costs", "Profit", "Per seat", ""].map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id}>
                <td><b>{r.name}</b></td><td><span className={`tagx ${r.kind === "lab" ? "v" : r.kind === "other" ? "" : "b"}`}>{r.kind}</span></td>
                <td className="text-[13px]">{r.secs.map((x) => `${classTitle(x.cls)}-${x.name}`).join(", ") || <span className="muted">empty</span>}</td>
                <td className="min-w-[120px]"><Bar value={r.cap ? r.students / r.cap : 0} color={r.cap && r.students > r.cap ? "#ef4444" : "#16a34a"} /><span className="text-[12px] font-bold">{r.students}/{r.cap || "—"}</span></td>
                <td className="tabular-nums">{r.empty}</td><td className="tabular-nums">{rupees(Math.round(r.income))}</td><td className="tabular-nums">{rupees(Math.round(r.cost))}</td>
                <td className={`tabular-nums font-black ${r.profit < 0 ? "text-[#b91c1c]" : "text-[#15803d]"}`}>{rupees(Math.round(r.profit))}</td>
                <td className="tabular-nums">{r.per == null ? "—" : rupees(Math.round(r.per))}</td>
                <td><form action={removeRoom}><input type="hidden" name="room_id" value={r.id} /><button className="muted text-[12px] underline" type="submit">Remove</button></form></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="muted mt-2 text-[12px]">Fee income = students × monthly fee × collection rate. Costs = each teacher&apos;s salary shared by their periods in that section + the room overhead ({rupees(more.overhead)} a month per room).</p>
      </section>
      <section className="flex flex-wrap items-start gap-5">
        <div className="card min-w-0 flex-[3_1_420px]">
          <h2 className="h2">Profit by room</h2>
          {rows.length === 0 ? <div className="mt-2"><Empty>No rooms yet.</Empty></div> : [...rows].sort((a, b) => b.profit - a.profit).map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-1">
              <span className="w-24 truncate text-[13px] font-bold">{r.name}</span>
              <div className="relative h-3.5 flex-1 rounded-full bg-[#eef2f7]">
                <div className="absolute top-0 h-full w-px bg-[#9ca3af]" style={{ left: "50%" }} />
                <div className="absolute top-0 h-full rounded-full" style={r.profit >= 0 ? { left: "50%", width: `${(r.profit / maxAbs) * 50}%`, background: "#16a34a" } : { right: "50%", width: `${(-r.profit / maxAbs) * 50}%`, background: "#ef4444" }} />
              </div>
              <span className="w-24 text-right text-[12px] font-black tabular-nums">{rupees(Math.round(r.profit))}</span>
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-[2_1_320px]"><Insight title="Suggestions for the director">{tips.length ? <ul className="ml-5 list-disc">{tips.slice(0, 5).map((t) => <li key={t}>{t}</li>)}</ul> : "Every room is used and earning more than it costs."}</Insight></div>
      </section>
      <section className="flex flex-wrap items-start gap-5">
        <form action={addRoom} className="card flex min-w-0 flex-[2_1_320px] flex-col gap-3">
          <h2 className="h2">Add room</h2>
          <div className="grid grid-cols-3 gap-2">
            <label className="field col-span-3 sm:col-span-1">Name<input className="input" name="name" required placeholder="Room 12" /></label>
            <label className="field">Type<select className="input" name="kind"><option value="classroom">Classroom</option><option value="lab">Lab</option><option value="other">Other</option></select></label>
            <label className="field">Seats<input className="input" type="number" min={1} name="capacity" placeholder="40" /></label>
          </div>
          <button className="btn self-start" type="submit">Add room</button>
        </form>
        <div className="card min-w-0 flex-[3_1_420px]">
          <h2 className="h2">Room for each section</h2>
          {s.sections.map((x) => (
            <form key={x.id} action={assignRoom}><Row>
              <input type="hidden" name="section_id" value={x.id} />
              <span className="flex-1 font-bold">{classTitle(x.cls)}-{x.name} <span className="muted text-[12px]">({x.students})</span></span>
              <select className="input w-40" style={{ minHeight: 34 }} name="room_id" defaultValue={more.roomOf.get(x.id) ?? ""} aria-label="Room"><option value="">No room</option>{more.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}{r.capacity ? ` (${r.capacity})` : ""}</option>)}</select>
              <button className="btn-ghost" style={sm} type="submit">Assign</button>
            </Row></form>
          ))}
          {unroomed.length > 0 && <p className="muted mt-1 text-[12px]">{unroomed.length} section{unroomed.length === 1 ? " has" : "s have"} no room.</p>}
          <form action={saveOverhead} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="field">Room overhead per month (Rs)<input className="input w-40" type="number" min={0} name="rupees" defaultValue={more.overhead / 100} /></label>
            <button className="btn-ghost" type="submit">Save</button>
            <span className="muted w-full text-[12px]">Rent, power and cleaning shared per room. Teachers&apos; salaries come from each person&apos;s staff record.</span>
          </form>
        </div>
      </section>
    </>
  );
}

// ================= Bell timings =================
const KINDS = [["winter", "Winter"], ["summer", "Summer"], ["ramadan", "Ramadan"], ["friday", "Friday"], ["exam", "Exam days"]] as const;
export async function BellsMode({ kind }: { kind?: string }) {
  const supabase = await createClient();
  const today = todayPK();
  const { data: profs } = await supabase.from("timing_profiles").select("id, name, kind, is_active, active_from, active_to, start_time, period_minutes, periods_per_day, break_after, break_minutes, assembly_minutes").order("name");
  // automatic switching: winter / summer / Ramadan by their dates (Friday and exam days apply on their own days)
  const due = (profs ?? []).find((q) => ["winter", "summer", "ramadan"].includes(q.kind) && q.active_from && q.active_from <= today && (!q.active_to || q.active_to >= today));
  if (due && !due.is_active) {
    await supabase.from("timing_profiles").update({ is_active: false }).eq("is_active", true);
    await supabase.from("timing_profiles").update({ is_active: true }).eq("id", due.id);
    for (const q of profs ?? []) q.is_active = q.id === due.id;
  }
  const active = (profs ?? []).find((q) => q.is_active);
  const k = KINDS.some(([id]) => id === kind) ? kind! : (active && KINDS.some(([id]) => id === active.kind) ? active.kind : "winter");
  const prof = (profs ?? []).find((q) => q.kind === k);
  const { data: periods } = prof ? await supabase.from("periods").select("name, kind, starts_at, ends_at, sort").eq("timing_profile_id", prof.id).order("sort") : { data: [] };
  const { data: papers } = await supabase.from("exam_papers").select("paper_date, starts_at, ends_at, subjects(name), classes(name)").gte("paper_date", today).order("paper_date").limit(8);
  const mins = (a: string, b: string) => (Date.parse(`1970-01-01T${b}Z`) - Date.parse(`1970-01-01T${a}Z`)) / 60000;
  const rng = (q: { active_from: string | null; active_to: string | null }) => q.active_from ? `${shortDate(q.active_from)} – ${q.active_to ? shortDate(q.active_to) : "on"}` : "dates not set";
  return (
    <section className="flex flex-wrap items-start gap-5">
      <div className="card flex min-w-0 flex-[3_1_520px] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Bell timings</h2><span className="tagx g">In use: {active?.name ?? "none"}</span></div>
        <Chips label="Schedule" current={k} items={KINDS.map(([id, label]) => ({ id, label, href: `/principal/classes?tab=bells&kind=${id}` }))} />
        {k === "exam" && <p className="rounded-[12px] bg-[#fffbeb] p-2.5 text-[13px] font-bold text-[#92400e]">On days with papers on the date sheet, the paper times below come from Exams. This schedule covers the rest of the exam day.</p>}
        <form action={saveBellSchedule} className="flex flex-col gap-3">
          <input type="hidden" name="kind" value={k} />
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
            <label className="field">School starts<input className="input" type="time" name="start_time" defaultValue={prof?.start_time?.slice(0, 5) ?? "08:00"} required /></label>
            <label className="field">Assembly (min)<input className="input" type="number" min={0} max={60} name="assembly_minutes" defaultValue={prof?.assembly_minutes ?? 15} /></label>
            <label className="field">Period length<input className="input" type="number" min={20} max={90} name="period_minutes" defaultValue={prof?.period_minutes ?? (k === "ramadan" ? 30 : k === "friday" ? 35 : 40)} /></label>
            <label className="field">Periods a day<input className="input" type="number" min={1} max={12} name="periods_per_day" defaultValue={prof?.periods_per_day ?? (k === "friday" ? 6 : 8)} /></label>
            <label className="field">Break after period<input className="input" type="number" min={0} max={12} name="break_after" defaultValue={prof?.break_after ?? 4} /></label>
            <label className="field">Break (min)<input className="input" type="number" min={0} max={90} name="break_minutes" defaultValue={prof?.break_minutes ?? 20} /></label>
          </div>
          {["winter", "summer", "ramadan"].includes(k) && (
            <div className="grid grid-cols-2 gap-2.5">
              <label className="field">Use from<input className="input" type="date" name="active_from" defaultValue={prof?.active_from ?? ""} /></label>
              <label className="field">Until<input className="input" type="date" name="active_to" defaultValue={prof?.active_to ?? ""} /></label>
            </div>
          )}
          <label className="flex items-center gap-2.5 text-[14px] font-extrabold"><input type="checkbox" name="use_now" className="h-5 w-5" /> Use this schedule from today</label>
          <button className="btn self-start" type="submit">Save and work out the day</button>
        </form>
        <div>
          <div className="kick mb-1">The day{prof ? ` · ${prof.name}` : ""}</div>
          {(periods ?? []).length === 0 ? <Empty>Not set yet. Fill in the numbers above and save: the times are worked out for you.</Empty> : (periods ?? []).map((q) => (
            <Row key={q.sort + q.name} className={q.kind === "break" ? "rounded-xl bg-[#fff7ed] px-2" : q.kind === "assembly" ? "rounded-xl bg-[#f5f3ff] px-2" : ""}>
              <span className="w-32 font-black tabular-nums">{time(q.starts_at)} – {time(q.ends_at)}</span><span className="flex-1 font-bold">{q.name}</span><span className="kick">{mins(q.starts_at, q.ends_at)} min</span>
            </Row>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
        <div className="card">
          <h2 className="h2">Switch automatically</h2>
          {KINDS.map(([id, l]) => { const q = (profs ?? []).find((x) => x.kind === id); return (
            <Row key={id}><span className="flex-1 font-bold">{l}</span><span className="muted text-[12px]">{id === "friday" ? (q ? "every Friday" : "not set") : id === "exam" ? "from the Exams date sheet" : q ? rng(q) : "not set"}</span>{q?.is_active && <span className="tagx g">Now</span>}</Row>
          ); })}
          <p className="muted mt-1 text-[12px]">Winter, summer and Ramadan switch on their &ldquo;use from&rdquo; date the next time this page or the timetable opens.</p>
        </div>
        <Insight title="Good to know">Changing timings keeps every section&apos;s timetable: period 1 stays period 1, only the clock times move.</Insight>
        <div className="card" style={{ background: "#fffbeb", borderColor: "#fcd34d" }}>
          <div className="font-black">Date sheets are in Exams</div>
          {(papers ?? []).length ? (papers as unknown as { paper_date: string; starts_at: string | null; ends_at: string | null; subjects: { name: string } | null; classes: { name: string } | null }[]).map((q, i) => (
            <div key={i} className="text-[13px] font-bold">{shortDate(q.paper_date)} · {q.subjects?.name} · {q.classes?.name} · {time(q.starts_at)}{q.ends_at ? `–${time(q.ends_at)}` : ""}</div>
          )) : <p className="muted text-[13px]">No papers coming up.</p>}
          <Link href="/principal/exams" className="btn-ghost mt-2" style={sm}>Open Exams</Link>
        </div>
      </div>
    </section>
  );
}

