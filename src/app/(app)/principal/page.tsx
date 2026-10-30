import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { LiveRefresh } from "@/components/live-refresh";
import { Icon } from "@/components/icons";
import { pct, rupees, shortDate, todayPK } from "@/lib/format";

const GOAL = 0.9;

export default async function PrincipalToday() {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const today = todayPK();
  const monthStart = today.slice(0, 8) + "01";
  const since = new Date(Date.parse(today) - 20 * 86400000).toISOString().slice(0, 10);

  const weekAhead = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
  const [days, sections, sectionToday, students, invoices, leave, admissions, absences, notices, staffMarked, nextHoliday, owing] = await Promise.all([
    supabase.from("attendance_by_day").select("date, rate, marked, present").gte("date", since).order("date"),
    supabase.from("sections").select("id, name, classes(name, sort)"),
    supabase.from("attendance_by_section_day").select("section_id, present, marked").eq("date", today),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "enrolled"),
    supabase.from("invoices").select("id, invoice_lines(amount_paisa), payments(amount_paisa)").eq("billing_month", monthStart),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("admissions").select("id", { count: "exact", head: true }).in("status", ["inquiry", "test", "offered"]),
    supabase.from("attendance").select("student_id, students(full_name, sections(name, classes(name)))").eq("status", "absent").gte("date", since),
    supabase.from("notices").select("id, title, created_at").order("created_at", { ascending: false }).limit(3),
    supabase.from("staff_attendance").select("id", { count: "exact", head: true }).eq("date", today),
    supabase.from("holidays").select("title, starts_on").gt("starts_on", today).lte("starts_on", weekAhead).order("starts_on").limit(1).maybeSingle(),
    supabase.from("family_balances").select("family_id", { count: "exact", head: true }).gt("balance_paisa", 0),
  ]);

  // attendance
  const series = (days.data ?? []).map((d) => ({ date: d.date as string, rate: Number(d.rate) }));
  const todayRow = series.find((d) => d.date === today);
  const total = students.count ?? 0;
  const markedToday = (sectionToday.data ?? []).reduce((t, s) => t + s.marked, 0);
  const presentToday = (sectionToday.data ?? []).reduce((t, s) => t + s.present, 0);
  const rateToday = markedToday ? presentToday / markedToday : 0;
  type Sec = { id: string; name: string; classes: { name: string; sort: number } };
  const secRows = ((sections.data ?? []) as unknown as Sec[])
    .sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name))
    .map((s) => {
      const t = (sectionToday.data ?? []).find((x) => x.section_id === s.id);
      return { id: s.id, label: `${s.classes.name}-${s.name}`, marked: !!t?.marked, rate: t?.marked ? t.present / t.marked : 0 };
    });
  const unmarked = secRows.filter((s) => !s.marked).length;

  // school days in a row at or above the goal; today only counts once every section is marked
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].date === today && unmarked > 0) continue;
    if (series[i].rate >= GOAL) streak++; else break;
  }

  // fees for this month
  type Inv = { invoice_lines: { amount_paisa: number }[]; payments: { amount_paisa: number }[] };
  let due = 0, paid = 0;
  for (const i of (invoices.data ?? []) as unknown as Inv[]) {
    due += i.invoice_lines.reduce((t, l) => t + Number(l.amount_paisa), 0);
    paid += i.payments.reduce((t, p) => t + Number(p.amount_paisa), 0);
  }
  const feeRate = due ? paid / due : 0;

  // students with 3 or more absences in 3 weeks
  const absentCount = new Map<string, { n: number; name: string; cls: string }>();
  type Ab = { student_id: string; students: { full_name: string; sections: { name: string; classes: { name: string } } | null } };
  for (const a of (absences.data ?? []) as unknown as Ab[]) {
    const cur = absentCount.get(a.student_id) ?? { n: 0, name: a.students.full_name, cls: a.students.sections ? `${a.students.sections.classes.name}-${a.students.sections.name}` : "" };
    cur.n++; absentCount.set(a.student_id, cur);
  }
  const atRisk = [...absentCount.values()].filter((x) => x.n >= 3).sort((a, b) => b.n - a.n);

  const take = !todayRow && markedToday === 0
    ? `No class has marked attendance yet today. ${pct(feeRate)} of this month's fees are in.`
    : `Attendance is ${pct(rateToday, 1)} so far, with ${unmarked} section${unmarked === 1 ? "" : "s"} still to mark. ${pct(feeRate)} of this month's fees are in.`;

  // the morning list: what needs the principal first, most urgent on top
  const todo: { text: string; href: string }[] = [];
  if (markedToday > 0 && unmarked > 0) todo.push({ text: `${unmarked} section${unmarked === 1 ? " hasn't" : "s haven't"} marked attendance yet`, href: "/principal" });
  if (!staffMarked.count) todo.push({ text: "Staff attendance isn't marked for today", href: "/principal/staff" });
  if (leave.count) todo.push({ text: `${leave.count} leave request${leave.count === 1 ? "" : "s"} waiting`, href: "/principal/staff" });
  if (atRisk.length) todo.push({ text: `Call the parents of ${atRisk.length} student${atRisk.length === 1 ? "" : "s"} absent 3 or more times`, href: "/principal/students" });
  if ((invoices.data ?? []).length === 0) todo.push({ text: "This month's fee challans aren't made yet", href: "/accounts/setup" });
  else if (owing.count) todo.push({ text: `${owing.count} famil${owing.count === 1 ? "y owes" : "ies owe"} fees: send reminders`, href: "/accounts/messages" });
  if (nextHoliday.data) todo.push({ text: `${nextHoliday.data.title} on ${shortDate(nextHoliday.data.starts_on)}: tell parents`, href: "/principal/notices" });
  if (admissions.count) todo.push({ text: `${admissions.count} admission${admissions.count === 1 ? "" : "s"} in progress`, href: "/principal/admissions" });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="chip"><Icon.flame /> {streak} <span className="muted">day streak</span></span>
        <span className="chip"><Icon.coin size={22} /> {pct(feeRate)} <span className="muted">fees in</span></span>
        <span className="chip"><Icon.check size={22} /> {markedToday}/{total} <span className="muted">marked</span></span>
        <LiveRefresh tables={["attendance", "payments", "leave_requests"]} />
      </div>

      <section className="card">
        <span className="pill pill-gray self-start">{shortDate(today)} · {me.campus_name}</span>
        <h1 className="h1">Assalam-o-Alaikum, {me.full_name.split(" ")[0]}</h1>
        <p className="text-lg">{take}</p>
        {todo.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">Do these first</span>
            <ol className="flex flex-col gap-1">
              {todo.slice(0, 5).map((t, i) => (
                <li key={t.text}><Link href={t.href} className="flex items-baseline gap-2 font-extrabold hover:underline"><span className="muted tabular-nums">{i + 1}.</span>{t.text}</Link></li>
              ))}
            </ol>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm font-extrabold"><span>Daily goal: 90% attendance</span><span>{markedToday ? pct(rateToday, 1) : "—"}</span></div>
          <div className="track h-[18px]"><i style={{ width: `${Math.min(100, rateToday * 100)}%`, background: rateToday && rateToday < GOAL ? "var(--orange)" : undefined }} />
            <span className="absolute inset-y-[-3px] w-[3px] rounded bg-[var(--ink)] opacity-50" style={{ left: "90%" }} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Fees collected" value={rupees(paid)} sub={`of ${rupees(due)} due this month`} />
          <Tile label="Outstanding" value={rupees(due - paid)} sub="this month" />
          <Tile label="Leave requests" value={String(leave.count ?? 0)} sub="waiting for you" href="/principal/staff" />
          <Tile label="Admissions open" value={String(admissions.count ?? 0)} sub="inquiries, tests, offers" href="/principal/admissions" />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <section className="card">
          <div className="flex items-baseline justify-between"><h2 className="h2">Attendance by section today</h2><span className="muted">{unmarked} not marked</span></div>
          <div className="flex flex-col gap-3">
            {secRows.map((s) => (
              <div key={s.id} className="grid grid-cols-[90px_1fr_56px] items-center gap-3">
                <span className="font-extrabold">{s.label}</span>
                <div className="track">{s.marked && <i style={{ width: `${s.rate * 100}%`, background: s.rate < GOAL ? "var(--orange)" : undefined }} />}</div>
                <span className="text-right font-extrabold tabular-nums">{s.marked ? pct(s.rate) : <span className="muted">—</span>}</span>
              </div>
            ))}
          </div>
          <h2 className="h2 mt-3">Last 3 weeks</h2>
          <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Daily attendance rate for the last three weeks">
            {series.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${shortDate(d.date)}: ${pct(d.rate, 1)}`}>
                <div className="w-full max-w-8 rounded-lg" style={{ height: `${Math.max(4, (d.rate - 0.7) / 0.3 * 140)}px`, background: d.rate >= GOAL ? "var(--green)" : "var(--orange)", boxShadow: `0 -4px 0 inset ${d.rate >= GOAL ? "var(--green-lip)" : "#cd7900"}` }} />
                <span className="text-[10px] font-bold text-[var(--muted)]">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section className="card">
            <h2 className="h2">Students to watch</h2>
            <p className="muted">3 or more absences in the last 3 weeks</p>
            {atRisk.length === 0 && <p className="muted">Nobody right now.</p>}
            {atRisk.slice(0, 6).map((s) => (
              <div key={s.name + s.cls} className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full text-xs font-black" style={{ background: "var(--red-soft)", color: "var(--red-ink)" }}>{s.n}</span>
                <div><div className="font-extrabold">{s.name}</div><div className="muted text-xs">{s.cls} · absent {s.n} days</div></div>
              </div>
            ))}
          </section>
          <section className="card">
            <div className="flex items-baseline justify-between"><h2 className="h2">Latest notices</h2><Link className="eyebrow" href="/principal/notices">New notice</Link></div>
            {(notices.data ?? []).map((n) => <div key={n.id} className="font-extrabold">{n.title}</div>)}
          </section>
        </div>
      </div>
    </>
  );
}

function Tile({ label, value, sub, href }: { label: string; value: string; sub: string; href?: string }) {
  const inner = (<><span className="muted">{label}</span><b>{value}</b><span className="text-xs font-extrabold text-[var(--muted)]">{sub}</span></>);
  return href ? <Link href={href} className="tile hover:border-[var(--blue-ring)]">{inner}</Link> : <div className="tile">{inner}</div>;
}
