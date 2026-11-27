import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { LiveRefresh } from "@/components/live-refresh";
import { pct, rupees, shortDate, todayPK } from "@/lib/format";
import { AutoSend } from "@/components/auto-send";
import { loadMessagingConfig, readyChannels } from "@/lib/deliver";
import { pkDayRange } from "@/lib/expense-categories";

const GOAL = 0.9;
const DAY = 86400000;
const STAFF_ROLES = ["principal", "teacher", "accountant"];

export default async function PrincipalToday() {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const today = todayPK();
  const monthStart = today.slice(0, 8) + "01";
  const ago = (n: number) => new Date(Date.parse(today) - n * DAY).toISOString().slice(0, 10);
  const chartSince = ago(30);
  const since = ago(20); // the 3-week window for "students to call"
  const weekAhead = new Date(Date.parse(today) + 7 * DAY).toISOString().slice(0, 10);

  const [todayPayments, days, sections, sectionToday, students, invoices, leave, claims, admissions, absences, staffToday, staffCount, nextHoliday, owing, waiting, absentWaiting, config] = await Promise.all([
    supabase.from("payments").select("amount_paisa, mode").gte("received_at", pkDayRange(today)[0]).lt("received_at", pkDayRange(today)[1]),
    supabase.from("attendance_by_day").select("date, rate, marked, present").gte("date", chartSince).order("date"),
    supabase.from("sections").select("id, name, capacity, classes(name, sort)"),
    supabase.from("attendance_by_section_day").select("section_id, present, marked").eq("date", today),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "enrolled"),
    supabase.from("invoices").select("id, invoice_lines(amount_paisa), payments(amount_paisa)").eq("billing_month", monthStart),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("payment_claims").select("amount_paisa").eq("status", "pending"),
    supabase.from("admissions").select("id", { count: "exact", head: true }).in("status", ["inquiry", "test", "offered"]),
    supabase.from("attendance").select("student_id, students(full_name, roll_no, families(phone, reminder_phone), sections(name, classes(name)))").eq("status", "absent").gte("date", since),
    supabase.from("staff_attendance").select("status").eq("date", today),
    supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", STAFF_ROLES).eq("is_active", true),
    supabase.from("holidays").select("title, starts_on").gt("starts_on", today).lte("starts_on", weekAhead).order("starts_on").limit(1).maybeSingle(),
    supabase.from("family_balances").select("family_id", { count: "exact", head: true }).gt("balance_paisa", 0),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("status", "queued"),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("status", "queued").eq("kind", "absent"),
    loadMessagingConfig(supabase),
  ]);
  const canSend = readyChannels(config).length > 0;

  // ---------- attendance ----------
  const series = (days.data ?? []).map((d) => ({ date: d.date as string, rate: Number(d.rate) }));
  const yesterday = series.filter((d) => d.date < today).at(-1);
  const total = students.count ?? 0;
  const markedToday = (sectionToday.data ?? []).reduce((t, s) => t + s.marked, 0);
  const presentToday = (sectionToday.data ?? []).reduce((t, s) => t + s.present, 0);
  const rateToday = markedToday ? presentToday / markedToday : 0;
  type Sec = { id: string; name: string; capacity: number | null; classes: { name: string; sort: number } };
  const secList = ((sections.data ?? []) as unknown as Sec[])
    .sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const secRows = secList.map((s) => {
    const t = (sectionToday.data ?? []).find((x) => x.section_id === s.id);
    return { id: s.id, cls: s.classes.name, sec: s.name, marked: !!t?.marked, rate: t?.marked ? t.present / t.marked : 0 };
  });
  const unmarked = secRows.filter((s) => !s.marked);
  const classNames = [...new Set(secRows.map((s) => s.cls))];

  // ---------- fees this month ----------
  type Inv = { invoice_lines: { amount_paisa: number }[]; payments: { amount_paisa: number }[] };
  let due = 0, paid = 0;
  for (const inv of (invoices.data ?? []) as unknown as Inv[]) {
    due += inv.invoice_lines.reduce((t, l) => t + Number(l.amount_paisa), 0);
    paid += inv.payments.reduce((t, p) => t + Number(p.amount_paisa), 0);
  }
  const feeRate = due ? paid / due : 0;
  const claimCount = (claims.data ?? []).length;
  const claimSum = (claims.data ?? []).reduce((t, c) => t + Number(c.amount_paisa), 0);

  // ---------- staff ----------
  const staffMarked = (staffToday.data ?? []).length;
  const staffPresent = (staffToday.data ?? []).filter((s) => s.status === "present" || s.status === "late").length;
  const staffTotal = staffCount.count || staffMarked;

  // ---------- students with 3 or more absences in 3 weeks ----------
  type Ab = { student_id: string; students: { full_name: string; roll_no: string | null; families: { phone: string | null; reminder_phone: string | null } | null; sections: { name: string; classes: { name: string } } | null } };
  const absentCount = new Map<string, { id: string; n: number; name: string; roll: string | null; phone: string | null; cls: string }>();
  for (const a of (absences.data ?? []) as unknown as Ab[]) {
    const s = a.students;
    const cur = absentCount.get(a.student_id) ?? {
      id: a.student_id, n: 0, name: s.full_name, roll: s.roll_no,
      phone: s.families?.reminder_phone || s.families?.phone || null,
      cls: s.sections ? `${s.sections.classes.name}-${s.sections.name}` : "",
    };
    cur.n++; absentCount.set(a.student_id, cur);
  }
  const atRisk = [...absentCount.values()].filter((x) => x.n >= 3).sort((a, b) => b.n - a.n);

  // ---------- what needs the principal first, most urgent on top ----------
  type Todo = { title: string; detail: string; href: string; action: string; tag: string; tone: "red" | "gray" | "purple" };
  const todo: Todo[] = [];
  if (markedToday > 0 && unmarked.length > 0) todo.push({ title: `${unmarked.length} section${unmarked.length === 1 ? " hasn't" : "s haven't"} marked attendance`, detail: unmarked.slice(0, 6).map((s) => `${s.cls}-${s.sec}`).join(", "), href: "/principal/classes", action: "Open classes", tag: "Today", tone: "red" });
  if (!staffMarked) todo.push({ title: "Staff attendance isn't marked for today", detail: `${staffCount.count ?? 0} staff on the list`, href: "/principal/staff", action: "Mark staff", tag: "Staff", tone: "red" });
  if (leave.count) todo.push({ title: `${leave.count} leave request${leave.count === 1 ? "" : "s"} waiting`, detail: "Approve or refuse so classes can be covered", href: "/principal/staff", action: "Review", tag: "Approval", tone: "purple" });
  if (claimCount) todo.push({ title: `${claimCount} JazzCash / Easypaisa payment${claimCount === 1 ? "" : "s"} to confirm`, detail: `${rupees(claimSum)} sent by parents: check the transaction ID and confirm`, href: "/accounts/online", action: "Confirm", tag: "Finance", tone: "gray" });
  if (atRisk.length) todo.push({ title: `Call the parents of ${atRisk.length} student${atRisk.length === 1 ? "" : "s"}`, detail: "Absent 3 or more times in the last 3 weeks", href: "#follow-up", action: "See list", tag: "Follow-up", tone: "red" });
  if ((invoices.data ?? []).length === 0) todo.push({ title: "This month's fee challans aren't made yet", detail: "Make them once and families can pay", href: "/accounts/setup", action: "Make challans", tag: "Finance", tone: "gray" });
  else if (owing.count) todo.push({ title: `${owing.count} famil${owing.count === 1 ? "y owes" : "ies owe"} fees`, detail: "Send a WhatsApp / SMS reminder", href: "/accounts/messages", action: "Send reminders", tag: "Finance", tone: "gray" });
  if (nextHoliday.data) todo.push({ title: `${nextHoliday.data.title} on ${shortDate(nextHoliday.data.starts_on)}`, detail: "Tell parents with a notice", href: "/principal/notices", action: "Write notice", tag: "Notice", tone: "purple" });
  if (absentWaiting.count && !canSend) todo.push({ title: `${absentWaiting.count} absent message${absentWaiting.count === 1 ? "" : "s"} to parents waiting`, detail: "Send with one tap", href: "/accounts/messages", action: "Send", tag: "Messages", tone: "gray" });
  if (admissions.count) todo.push({ title: `${admissions.count} admission${admissions.count === 1 ? "" : "s"} in progress`, detail: "Inquiries, tests and offers", href: "/principal/admissions", action: "Open", tag: "Admissions", tone: "gray" });

  const sub = markedToday
    ? `${presentToday.toLocaleString("en-IN")} of ${markedToday.toLocaleString("en-IN")} marked students are present · ${secRows.length - unmarked.length} of ${secRows.length} sections have marked.`
    : "No class has marked attendance yet today.";

  // ---------- money taken today ----------
  const todayPays = todayPayments.data ?? [];
  const todayBy: Record<string, number> = { cash: 0, jazzcash: 0, easypaisa: 0 };
  for (const p of todayPays) todayBy[p.mode in todayBy ? p.mode : "cash"] += Number(p.amount_paisa);
  const todayTotal = todayBy.cash + todayBy.jazzcash + todayBy.easypaisa;
  const outstanding = Math.max(0, due - paid);
  const longDate = new Date(today + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const attDelta = yesterday && markedToday ? rateToday - yesterday.rate : null;
  // classes with the lowest attendance today, so the principal knows where to walk in
  const classRate = classNames.map((c) => {
    const ids = secList.filter((x) => x.classes.name === c).map((x) => x.id);
    const t = (sectionToday.data ?? []).filter((x) => ids.includes(x.section_id));
    const m = t.reduce((a, x) => a + x.marked, 0), pr = t.reduce((a, x) => a + x.present, 0);
    return { name: c, rate: m ? pr / m : null, absent: m - pr };
  }).filter((c) => c.rate != null).sort((a, b) => a.rate! - b.rate!);

  return (
    <>
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <form action="/principal/students" role="search" className="flex min-h-[46px] flex-[1_1_300px] items-center gap-2.5 rounded-[14px] border-2 border-[#e5e7eb] bg-white px-3">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input name="q" aria-label="Search students" placeholder="Search student, roll no, B-form, parent phone…" className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none" />
        </form>
        <LiveRefresh tables={["attendance", "payments", "leave_requests"]} />
        {canSend && <AutoSend waiting={waiting.count ?? 0} />}
      </div>

      <section>
        <div className="muted text-[13px]">{longDate}</div>
        <h1 className="h1 mt-1" style={{ fontSize: 30 }}>Assalamu Alaikum, {me.full_name}</h1>
        <p className="muted mt-0.5 text-[15px]">{todo.length ? `${todo.length} thing${todo.length === 1 ? "" : "s"} need${todo.length === 1 ? "s" : ""} you today.` : "Nothing urgent right now."} {sub}</p>
      </section>

      {/* the few numbers that matter today */}
      <section className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Kp href="/principal/attendance" bg="#fff7ed" bd="#fed7aa" fg="#ea580c" d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"
          label="Students present" value={markedToday ? pct(rateToday, 1) : "—"} change={attDelta} changeLabel={attDelta == null ? undefined : `${attDelta >= 0 ? "▲" : "▼"} ${Math.abs(attDelta * 100).toFixed(1)}%`}
          sub={markedToday ? `${(markedToday - presentToday).toLocaleString("en-IN")} absent of ${total.toLocaleString("en-IN")}` : "No class has marked yet"} />
        <Kp href="/principal/staff" bg="#eff6ff" bd="#bfdbfe" fg="#0284c7" d="M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          label="Staff present" value={staffMarked ? `${staffPresent}/${staffTotal}` : "—"} sub={staffMarked ? `${staffTotal - staffPresent} away today` : "Not marked yet today"} />
        <Kp href="/accounts/day-close" bg="#f0fdf4" bd="#bbf7d0" fg="#16a34a" d="M2 7h20v12H2zM2 11h20"
          label="Fees taken today" value={rupees(todayTotal)} sub={`${todayPays.length} receipt${todayPays.length === 1 ? "" : "s"}${claimCount ? ` · ${claimCount} online to confirm` : ""}`} />
        <Kp href="/accounts?view=overview" bg="#fdf2f8" bd="#fbcfe8" fg="#db2777" d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
          label="This month's fees" value={due ? pct(feeRate) : "—"} sub={due ? `${rupees(outstanding)} still to come · ${owing.count ?? 0} families` : "No challans yet"} />
      </section>

      <section className="flex flex-wrap items-stretch gap-4">
        <div id="actions" className="card min-w-0 flex-[1_1_340px] scroll-mt-20">
          <div className="mb-2.5 flex items-center justify-between"><h2 className="h2">Do these first</h2>{todo.length > 0 && <span className="tagx y">{todo.length} left</span>}</div>
          {todo.length === 0 && <p className="muted">All clear. Nothing waits for you right now.</p>}
          <div className="flex flex-col gap-2">
            {todo.map((t) => (
              <Link key={t.title} href={t.href} className="flex min-h-[50px] items-center gap-2.5 rounded-[14px] border-2 border-[#e5e7eb] bg-white px-2.5 py-1.5 text-[14px] font-extrabold hover:bg-[#f8fafc]">
                <span className={`h-6 w-6 flex-none rounded-lg border-[2.5px] ${t.tone === "red" ? "border-[#fca5a5]" : t.tone === "purple" ? "border-[#c4b5fd]" : "border-[#d1d5db]"}`} />
                <span className="min-w-0 flex-1"><span className="block">{t.title}</span><span className="muted block text-[12px]">{t.detail}</span></span>
                <span className="flex-none text-[12px] font-black text-[#0369a1] uppercase">{t.action}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card min-w-0 flex-[1_1_300px]">
          <div className="flex items-center justify-between gap-2"><h2 className="h2">Today&apos;s attendance</h2><Link href="/principal/attendance" className="text-[13px] font-extrabold text-[#0369a1]">Open</Link></div>
          <div className="mt-2 flex flex-col gap-2.5 rounded-[14px] bg-[#f8fafc] p-3.5 text-[14px] font-extrabold">
            <Line label="Present" value={`${presentToday.toLocaleString("en-IN")} of ${markedToday.toLocaleString("en-IN")}`} tone="text-[#15803d]" />
            <Line label="Absent" value={(markedToday - presentToday).toLocaleString("en-IN")} tone="text-[#b91c1c]" />
            <Line label="Sections marked" value={`${secRows.length - unmarked.length} of ${secRows.length}`} />
          </div>
          {markedToday > 0 && unmarked.length > 0 && <p className="mt-2.5 text-[13px] font-extrabold text-[#b91c1c]">Not marked: {unmarked.slice(0, 8).map((s) => `${s.cls}-${s.sec}`).join(", ")}{unmarked.length > 8 ? ` +${unmarked.length - 8}` : ""}</p>}
          {classRate.length > 0 && <div className="mt-2.5 text-[13px] font-extrabold"><div className="muted mb-1">Lowest today</div>
            {classRate.slice(0, 3).map((c) => <div key={c.name} className="flex justify-between border-t-2 border-[#f1f5f9] py-1.5"><span>{c.name}</span><span className={c.rate! < GOAL ? "text-[#b91c1c]" : ""}>{pct(c.rate!)} · {c.absent} absent</span></div>)}</div>}
        </div>

        <div className="card min-w-0 flex-[1_1_300px]">
          <div className="flex items-center justify-between gap-2"><h2 className="h2">Today&apos;s fees</h2><Link href="/accounts/day-close" className="text-[13px] font-extrabold text-[#0369a1]">Day close</Link></div>
          <div className="mt-2 flex flex-col gap-2.5 rounded-[14px] bg-[#f8fafc] p-3.5 text-[14px] font-extrabold">
            <Line label="Cash" value={rupees(todayBy.cash)} />
            <Line label="JazzCash" value={rupees(todayBy.jazzcash)} />
            <Line label="Easypaisa" value={rupees(todayBy.easypaisa)} />
            <Line label="Total today" value={rupees(todayTotal)} tone="text-[#15803d]" />
          </div>
          {due > 0 && <div className="mt-3"><div className="mb-1 flex justify-between text-[13px] font-extrabold"><span>This month</span><span className="tabular-nums">{rupees(paid)} / {rupees(due)}</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-[#eef2f7]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, feeRate * 100)}%`, background: feeRate < 0.8 ? "#f59e0b" : "#16a34a" }} /></div></div>}
          {claimCount > 0 && <Link href="/accounts/online" className="mt-2.5 block text-[13px] font-extrabold text-[#0369a1]">{claimCount} JazzCash / Easypaisa payment{claimCount === 1 ? "" : "s"} ({rupees(claimSum)}) to confirm →</Link>}
        </div>
      </section>

      {atRisk.length > 0 && <section id="follow-up" className="card scroll-mt-20">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div><h2 className="h2">Students to call</h2><p className="muted text-[13px]">3 or more absences in the last 3 weeks</p></div>
          <span className="tagx r">{atRisk.length} to call</span>
        </div>
        {atRisk.slice(0, 5).map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2.5">
            <div className="min-w-0 flex-1"><div className="truncate font-black">{s.name}</div>
              <div className="muted text-[12px]">{s.roll ? `Roll #${s.roll} · ` : ""}{s.cls} · {s.phone ?? "No phone saved"}</div></div>
            <span className="tagx r">{s.n} days</span>
            {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="btn" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }}>Call</a>}
            <Link href={`/principal/students/${s.id}`} className="btn-ghost" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }}>File</Link>
          </div>
        ))}
        {atRisk.length > 5 && <p className="muted mt-2 text-center text-[12px]">and {atRisk.length - 5} more</p>}
      </section>}

      <Link href="/principal/reports" className="muted self-start text-[13px] font-extrabold underline">Trends, classes, admissions and full fee breakdown are in Reports →</Link>
    </>
  );
}

function Kp({ href, bg, bd, fg, d, label, value, sub, change, changeLabel }: {
  href: string; bg: string; bd: string; fg: string; d: string; label: string; value: string; sub: string; change?: number | null; changeLabel?: string;
}) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-[18px] border-2 p-4" style={{ background: bg, borderColor: bd }}>
      <span className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px] bg-white" style={{ color: fg }}>
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg></span>
      <div className="min-w-0">
        <div className="muted text-[14px]">{label}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-[26px] leading-9 font-black tabular-nums">{value}
          {changeLabel && <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${(change ?? 0) >= 0 ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#fee2e2] text-[#b91c1c]"}`}>{changeLabel}</span>}</div>
        <div className="muted text-[12px]">{sub}</div>
      </div>
    </Link>
  );
}

function Line({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className={`flex items-center justify-between gap-2 ${tone}`}><span>{label}</span><span className="font-black tabular-nums">{value}</span></div>;
}

