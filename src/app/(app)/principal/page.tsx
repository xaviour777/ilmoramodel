import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { LiveRefresh } from "@/components/live-refresh";
import { pct, rupees, shortDate, todayPK } from "@/lib/format";
import { AutoSend } from "@/components/auto-send";
import { loadMessagingConfig, readyChannels } from "@/lib/deliver";

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

  const [extra, days, sections, sectionToday, students, invoices, monthPayments, leave, claims, admissions, absences, notices, staffToday, staffCount, nextHoliday, owing, waiting, absentWaiting, config] = await Promise.all([
    Promise.all([
      supabase.from("students").select("section_id").eq("status", "enrolled"),
      supabase.from("periods").select("name, kind, starts_at, ends_at, sort, timing_profiles!inner(is_active)").eq("timing_profiles.is_active", true).order("sort"),
      supabase.from("admissions").select("id, child_name, status, created_at, classes(name)").order("created_at", { ascending: false }).limit(4),
      supabase.from("exams").select("name, starts_on").gte("starts_on", today).order("starts_on").limit(1).maybeSingle(),
      supabase.from("campuses").select("schools(name)").eq("id", me.campus_id).maybeSingle(),
      supabase.from("invoices").select("id, invoice_lines(amount_paisa), payments(amount_paisa)").eq("billing_month", new Date(Date.parse(monthStart) - 20 * DAY).toISOString().slice(0, 8) + "01"),
    ]),
    supabase.from("attendance_by_day").select("date, rate, marked, present").gte("date", chartSince).order("date"),
    supabase.from("sections").select("id, name, capacity, classes(name, sort)"),
    supabase.from("attendance_by_section_day").select("section_id, present, marked").eq("date", today),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "enrolled"),
    supabase.from("invoices").select("id, invoice_lines(amount_paisa, students(sections(classes(sort)))), payments(amount_paisa)").eq("billing_month", monthStart),
    supabase.from("payments").select("amount_paisa, mode").gte("received_at", monthStart),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("payment_claims").select("amount_paisa").eq("status", "pending"),
    supabase.from("admissions").select("id", { count: "exact", head: true }).in("status", ["inquiry", "test", "offered"]),
    supabase.from("attendance").select("student_id, students(full_name, roll_no, families(phone, reminder_phone), sections(name, classes(name)))").eq("status", "absent").gte("date", since),
    supabase.from("notices").select("id, title, body, created_at").order("created_at", { ascending: false }).limit(3),
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
  const capacity = secList.reduce((t, s) => t + (s.capacity ?? 0), 0);
  const classNames = [...new Set(secRows.map((s) => s.cls))];

  // ---------- fees this month ----------
  type Inv = { invoice_lines: { amount_paisa: number; students: { sections: { classes: { sort: number } } | null } | null }[]; payments: { amount_paisa: number }[] };
  const WINGS = [
    { label: "Up to Class 5 (Primary)", test: (n: number) => n <= 5 },
    { label: "Class 6 - 8 (Middle)", test: (n: number) => n >= 6 && n <= 8 },
    { label: "Class 9 - 10 (Matric)", test: (n: number) => n >= 9 },
  ].map((w) => ({ ...w, due: 0, paid: 0 }));
  let due = 0, paid = 0, concessions = 0;
  for (const inv of (invoices.data ?? []) as unknown as Inv[]) {
    const invDue = inv.invoice_lines.reduce((t, l) => t + Number(l.amount_paisa), 0);
    const invPaid = inv.payments.reduce((t, p) => t + Number(p.amount_paisa), 0);
    due += invDue; paid += invPaid;
    for (const l of inv.invoice_lines) {
      const amt = Number(l.amount_paisa);
      if (amt < 0) concessions -= amt;
      const sort = l.students?.sections?.classes.sort;
      const wing = sort == null ? undefined : WINGS.find((w) => w.test(sort));
      if (!wing) continue;
      // a family pays one challan for all its children: split what was paid by each child's share
      wing.due += amt;
      if (invDue > 0) wing.paid += Math.min(invPaid, invDue) * amt / invDue;
    }
  }
  const feeRate = due ? paid / due : 0;
  const byMode: Record<string, number> = { cash: 0, jazzcash: 0, easypaisa: 0 };
  for (const p of monthPayments.data ?? []) byMode[p.mode in byMode ? p.mode : "cash"] += Number(p.amount_paisa);
  const claimCount = (claims.data ?? []).length;
  const claimSum = (claims.data ?? []).reduce((t, c) => t + Number(c.amount_paisa), 0);
  const approvals = (leave.count ?? 0) + claimCount;

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

  const attention = [
    { show: markedToday > 0 && unmarked.length > 0, dot: "bg-error animate-pulse", title: "Unmarked attendance", sub: `${unmarked.length} section${unmarked.length === 1 ? "" : "s"} pending`, subTone: "text-error", href: "/principal/classes" },
    { show: atRisk.length > 0, dot: "bg-tertiary-container", title: "Student follow-ups", sub: `${atRisk.length} absent 3+ times`, subTone: "text-on-surface-variant", href: "#follow-up" },
    { show: approvals > 0, dot: "bg-secondary", title: "Pending approvals", sub: [leave.count ? `${leave.count} leave` : "", claimCount ? `${claimCount} payment${claimCount === 1 ? "" : "s"} · ${rupees(claimSum)}` : ""].filter(Boolean).join(" · "), subTone: "text-secondary", href: leave.count ? "/principal/staff" : "/accounts/online" },
  ].filter((a) => a.show);

  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = me.full_name.split(" ")[0];
  const headline = attention.length
    ? `${greet}, ${first}. Your school needs attention in ${attention.length} area${attention.length === 1 ? "" : "s"}.`
    : `${greet}, ${first}. Nothing urgent right now.`;
  const sub = markedToday
    ? `${presentToday.toLocaleString("en-IN")} of ${markedToday.toLocaleString("en-IN")} marked students are present · ${secRows.length - unmarked.length} of ${secRows.length} sections have marked.`
    : "No class has marked attendance yet today.";

  // a plain summary built from today's numbers (not AI)
  const lowest = secRows.filter((s) => s.marked).sort((a, b) => a.rate - b.rate)[0];
  const summary = [
    markedToday ? `Attendance is ${pct(rateToday, 1)} so far${yesterday ? ` (${rateToday >= yesterday.rate ? "up" : "down"} from ${pct(yesterday.rate, 1)} last school day)` : ""}.` : "Attendance isn't in yet.",
    lowest && lowest.rate < GOAL ? `${lowest.cls}-${lowest.sec} is lowest at ${pct(lowest.rate)}.` : "",
    `${pct(feeRate)} of this month's fees are in.`,
    owing.count ? `${owing.count} famil${owing.count === 1 ? "y has" : "ies have"} a balance.` : "",
  ].filter(Boolean).join(" ");

  // ---------- extra numbers for the Home design ----------
  const [studentSections, periods, recentAdm, nextExam, campusRow, lastInvoices] = extra;
  const schoolName = (campusRow.data?.schools as unknown as { name: string } | null)?.name || me.campus_name;
  const perSection = new Map<string, number>();
  for (const st of studentSections.data ?? []) if (st.section_id) perSection.set(st.section_id, (perSection.get(st.section_id) ?? 0) + 1);
  const sortOf = new Map(secList.map((x) => [x.id, x.classes.sort]));
  const STAGES = [
    { label: "Primary (up to 5)", color: "#16a34a", test: (n: number) => n <= 5 },
    { label: "Middle (6-8)", color: "#0ea5e9", test: (n: number) => n >= 6 && n <= 8 },
    { label: "Matric (9-10)", color: "#8b5cf6", test: (n: number) => n >= 9 && n <= 10 },
    { label: "College (11-12)", color: "#f59e0b", test: (n: number) => n >= 11 },
  ].map((w) => ({ ...w, n: 0 }));
  for (const [sec, n] of perSection) { const so = sortOf.get(sec); const w = so == null ? undefined : STAGES.find((x) => x.test(so)); if (w) w.n += n; }
  const stageTotal = STAGES.reduce((t, w) => t + w.n, 0);
  let acc = 0;
  const donut = stageTotal ? STAGES.filter((w) => w.n).map((w) => { const a = acc; acc += (w.n / stageTotal) * 100; return `${w.color} ${a.toFixed(2)}% ${acc.toFixed(2)}%`; }).join(",") : "#e5e7eb 0 100%";
  // classes: attendance today rolled up from sections
  const classRows = classNames.map((c) => {
    const rows = secRows.filter((r) => r.cls === c);
    const ids = secList.filter((x) => x.classes.name === c).map((x) => x.id);
    const t = (sectionToday.data ?? []).filter((x) => ids.includes(x.section_id));
    const m = t.reduce((a, x) => a + x.marked, 0), pr = t.reduce((a, x) => a + x.present, 0);
    return { name: c, sections: rows.length, students: ids.reduce((a, id) => a + (perSection.get(id) ?? 0), 0), rate: m ? pr / m : null };
  });
  const markedClasses = classRows.filter((c) => c.rate != null).sort((a, b) => b.rate! - a.rate!);
  const lastDue = (lastInvoices.data ?? []).reduce((t, inv) => t + inv.invoice_lines.reduce((a, l) => a + Number(l.amount_paisa), 0), 0);
  const lastPaid = (lastInvoices.data ?? []).reduce((t, inv) => t + inv.payments.reduce((a, x) => a + Number(x.amount_paisa), 0), 0);
  const outstanding = Math.max(0, due - paid);
  const lastOutstanding = Math.max(0, lastDue - lastPaid);
  const nowHM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const hm = (t: string) => t.slice(0, 5);
  const longDate = new Date(today + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const delta = (a: number, b: number) => (b ? (a - b) / b : null);
  const attDelta = yesterday && markedToday ? rateToday - yesterday.rate : null;
  const feeDelta = lastDue ? delta(outstanding, lastOutstanding) : null;
  const ADM_TAG: Record<string, string> = { inquiry: "y", test: "b", offered: "v", admitted: "g", declined: "r" };

  return (
    <>
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <form action="/principal/students" role="search" className="flex min-h-[46px] flex-[1_1_300px] items-center gap-2.5 rounded-[14px] border-2 border-[#e5e7eb] bg-white px-3">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input name="q" aria-label="Search students" placeholder="Search student, roll no, B-form, parent phone…" className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none" />
        </form>
        <Link href="/principal/ai" className="flex min-h-[46px] items-center gap-2 rounded-[14px] border-2 border-[#c4b5fd] bg-[#f5f3ff] px-4 text-[14px] font-black text-[#6d28d9]">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg>AI tools</Link>
        <Link href="#actions" aria-label={`What needs you, ${todo.length} waiting`} className="relative flex h-[46px] w-[46px] items-center justify-center rounded-[14px] border-2 border-[#e5e7eb] bg-white">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2.4" strokeLinecap="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          {todo.length > 0 && <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-black text-white">{todo.length}</span>}
        </Link>
        <LiveRefresh tables={["attendance", "payments", "leave_requests"]} />
        {canSend && <AutoSend waiting={waiting.count ?? 0} />}
      </div>

      {/* greeting and quick actions */}
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="muted flex items-center gap-1.5 text-[13px]"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>{longDate}</div>
          <h1 className="h1 mt-1" style={{ fontSize: 32 }}>Assalamu Alaikum, {me.full_name}</h1>
          <p className="muted mt-0.5 text-[15px]">{headline.replace(/^Good (morning|afternoon|evening), [^.]+\. /, "")} {sub}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Qa href="/principal/admissions" bg="#dcfce7" fg="#15803d" d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6">Add student</Qa>
          <Qa href="/principal/classes" bg="#ede9fe" fg="#6d28d9" d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5">Classes</Qa>
          <Qa href="/principal/exams" bg="#e0f2fe" fg="#0369a1" d="M9 3h6v4H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4">Add exam</Qa>
          <Qa href="/principal/notices" bg="#ffedd5" fg="#c2410c" d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8">Send notice</Qa>
          <Qa href="/accounts?view=desk" bg="#dcfce7" fg="#15803d" d="M2 7h20v12H2zM2 11h20">Collect fee</Qa>
          <Qa href="/principal/reports" bg="#fff" fg="#374151" border d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z">Reports</Qa>
        </div>
      </section>

      {/* five numbers */}
      <section className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Kp href="/principal/students" bg="#f0fdf4" bd="#bbf7d0" fg="#16a34a" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9"
          label="Total students" value={total.toLocaleString("en-IN")} sub={capacity ? `${pct(total / capacity)} of ${capacity.toLocaleString("en-IN")} seats` : `${secRows.length} sections`} />
        <Kp href="/principal/classes" bg="#f5f3ff" bd="#ddd6fe" fg="#7c3aed" d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"
          label="Classes" value={String(classNames.length)} sub={`${secRows.length} section${secRows.length === 1 ? "" : "s"}`} />
        <Kp href="/principal/staff" bg="#eff6ff" bd="#bfdbfe" fg="#0284c7" d="M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          label="Teachers & staff" value={String(staffTotal)} sub={staffMarked ? `${staffPresent} present today` : "Not marked yet today"} />
        <Kp href="/principal/attendance" bg="#fff7ed" bd="#fed7aa" fg="#ea580c" d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"
          label="Today's attendance" value={markedToday ? pct(rateToday, 1) : "—"} change={attDelta} changeLabel={attDelta == null ? undefined : `${attDelta >= 0 ? "▲" : "▼"} ${Math.abs(attDelta * 100).toFixed(1)}%`}
          sub={markedToday ? (unmarked.length ? `${unmarked.length} section${unmarked.length === 1 ? "" : "s"} not marked` : "All sections marked") : "No class has marked yet"} />
        <Kp href="/accounts/calls" bg="#fdf2f8" bd="#fbcfe8" fg="#db2777" d="M2 7h20v12H2zM2 11h20"
          label="Pending fees" value={rupees(outstanding)} change={feeDelta == null ? null : -feeDelta} changeLabel={feeDelta == null ? undefined : `${feeDelta <= 0 ? "▼" : "▲"} ${Math.abs(feeDelta * 100).toFixed(0)}%`}
          sub={owing.count ? `${owing.count} famil${owing.count === 1 ? "y" : "ies"} with a balance` : "This month"} />
      </section>

      <section className="flex flex-wrap items-stretch gap-4">
        <div className="card min-w-0 flex-[5_1_480px]">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <h2 className="h2">School trend · attendance</h2>
            <span className="tagx">Last 30 days · goal 90%</span>
          </div>
          <TrendBars series={series} today={today} />
        </div>
        <div className="card min-w-0 flex-[3_1_280px]">
          <h2 className="h2">Students by section</h2>
          <div className="mt-3.5 flex flex-wrap items-center gap-4">
            <div className="flex h-[150px] w-[150px] flex-none items-center justify-center rounded-full" style={{ background: `conic-gradient(${donut})` }} role="img"
              aria-label={STAGES.filter((w) => w.n).map((w) => `${w.label} ${pct(w.n / Math.max(1, stageTotal))}`).join(", ") || "No students yet"}>
              <div className="flex h-[100px] w-[100px] flex-col items-center justify-center rounded-full bg-white"><span className="text-[22px] font-black">{stageTotal.toLocaleString("en-IN")}</span><span className="muted text-[12px]">students</span></div>
            </div>
            <div className="flex min-w-[150px] flex-1 flex-col gap-2 text-[14px] font-extrabold">
              {STAGES.filter((w) => w.n).map((w) => (
                <div key={w.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: w.color }} /><span className="flex-1">{w.label}</span>{pct(w.n / stageTotal)}</div>
              ))}
              {!stageTotal && <span className="muted">No students enrolled yet.</span>}
            </div>
          </div>
        </div>
        <div className="card min-w-0 flex-[3_1_280px]">
          <div className="flex items-center justify-between"><h2 className="h2">Today&apos;s schedule</h2><Link href="/principal/classes?tab=timings" className="text-[13px] font-extrabold text-[#0369a1]">Timings</Link></div>
          <div className="mt-2.5 flex flex-col gap-1 text-[14px] font-extrabold">
            {(periods.data ?? []).map((pr) => {
              const done = hm(pr.ends_at) <= nowHM, now = hm(pr.starts_at) <= nowHM && nowHM < hm(pr.ends_at);
              return (
                <div key={pr.sort + pr.name} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${now ? "border-2 border-[#fed7aa] bg-[#fff7ed]" : ""}`}>
                  <span className="muted w-24 text-[13px] tabular-nums">{hm(pr.starts_at)}–{hm(pr.ends_at)}</span><span className="flex-1">{pr.name}</span>
                  {now ? <span className="tagx y">Now</span> : done ? <span className="tagx g">Done</span> : null}
                </div>
              );
            })}
            {(periods.data ?? []).length === 0 && <p className="muted">No bell timings set yet.</p>}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-stretch gap-4">
        <div className="card min-w-0 flex-[5_1_560px]">
          <div className="flex items-center justify-between gap-2"><h2 className="h2">Classes overview · attendance today</h2><Link href="/principal/attendance" className="text-[13px] font-extrabold text-[#0369a1]">All sections</Link></div>
          <div className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
            {classRows.map((c, k) => {
              const tone = TONES[k % TONES.length];
              const rc = c.rate == null ? "#e5e7eb" : c.rate >= 0.95 ? "#16a34a" : c.rate >= GOAL ? "#f59e0b" : "#ef4444";
              const deg = c.rate == null ? 0 : c.rate * 100;
              return (
                <div key={c.name} className="flex items-center gap-2.5 rounded-[14px] border-2 border-[#eef2f7] bg-white p-2.5">
                  <span className={`ilm-tile ${tone} text-[13px] font-black`}>{c.name.replace(/^class\s*/i, "").slice(0, 3)}</span>
                  <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-black">{c.name}</div><div className="muted text-[12px]">{c.students} students</div></div>
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full" style={{ background: `conic-gradient(${rc} 0 ${deg}%, #e5e7eb ${deg}% 100%)` }} title={c.rate == null ? "Not marked" : pct(c.rate)}>
                    <b className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white text-[10px] font-black">{c.rate == null ? "—" : pct(c.rate)}</b></span>
                </div>
              );
            })}
            {classRows.length === 0 && <p className="muted">No classes yet.</p>}
          </div>
        </div>
        <div className="card min-w-0 flex-[3_1_300px]">
          <h2 className="h2">Quick insights</h2>
          <div className="mt-2">
            <Insight tile="t-y" mark="★" label="Best attendance today" value={markedClasses[0] ? `${markedClasses[0].name} · ${pct(markedClasses[0].rate!)}` : "—"} />
            <Insight tile="t-o" mark="!" label="Lowest attendance" value={markedClasses.length > 1 ? `${markedClasses.at(-1)!.name} · ${pct(markedClasses.at(-1)!.rate!)}` : "—"} />
            <Insight tile="t-g" mark="Rs" label="Fee collection" value={due ? `${pct(feeRate)} · ${rupees(paid)} / ${rupees(due)}` : "No challans yet"} />
            <Insight tile="t-v" mark="✓" label="Next exam" value={nextExam.data ? `${nextExam.data.name} · ${shortDate(nextExam.data.starts_on!)}` : "None planned"} />
            <Insight tile="t-b" mark="H" label="Next holiday" value={nextHoliday.data ? `${nextHoliday.data.title} · ${shortDate(nextHoliday.data.starts_on)}` : "None this week"} />
            <Insight tile="t-p" mark="✉" label="Messages waiting" value={String(waiting.count ?? 0)} />
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-stretch gap-4">
        <div id="actions" className="card min-w-0 flex-[1_1_320px] scroll-mt-20">
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
        <div className="card min-w-0 flex-[1_1_320px]">
          <div className="flex items-center justify-between"><h2 className="h2">Recent admissions</h2><Link href="/principal/admissions" className="text-[13px] font-extrabold text-[#0369a1]">View all</Link></div>
          <div className="mt-1.5 overflow-x-auto"><table className="w-full border-collapse text-[14px]">
            <thead><tr>{["Student", "Class", "Status"].map((h) => <th key={h} className="px-2 py-2.5 text-left text-[12px] font-black tracking-[.08em] text-[#6b7280] uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {(recentAdm.data ?? []).map((a) => (
                <tr key={a.id}><td className="border-t-2 border-[#f1f5f9] px-2 py-2.5 font-bold">{a.child_name}</td>
                  <td className="border-t-2 border-[#f1f5f9] px-2 py-2.5 font-bold">{(a.classes as unknown as { name: string } | null)?.name ?? "—"}</td>
                  <td className="border-t-2 border-[#f1f5f9] px-2 py-2.5"><span className={`tagx ${ADM_TAG[a.status] ?? ""}`}>{a.status[0].toUpperCase() + a.status.slice(1)}</span></td></tr>
              ))}
            </tbody>
          </table></div>
          {(recentAdm.data ?? []).length === 0 && <p className="muted mt-2">No admissions yet.</p>}
        </div>
        <div className="card min-w-0 flex-[1_1_320px]">
          <div className="flex items-center justify-between"><h2 className="h2">Recent notices</h2><Link href="/principal/notices" className="text-[13px] font-extrabold text-[#0369a1]">View all</Link></div>
          <div className="mt-2">
            {(notices.data ?? []).map((n, k) => (
              <div key={n.id} className="flex items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2.5">
                <span className={`ilm-tile ${["t-p", "t-b", "t-g"][k % 3]} font-black`} style={{ width: 32, height: 32 }}>{n.title[0]?.toUpperCase()}</span>
                <div className="min-w-0 flex-1"><div className="truncate font-black">{n.title}</div><div className="muted truncate text-[12px]">{n.body}</div></div>
                <span className="muted flex-none text-[12px]">{n.created_at.slice(0, 10) === today ? "Today" : shortDate(n.created_at.slice(0, 10))}</span>
              </div>
            ))}
            {(notices.data ?? []).length === 0 && <p className="muted">No notices yet.</p>}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-stretch gap-4">
        <div className="card min-w-0 flex-[3_1_480px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="h2">Fees this month</h2><p className="muted text-[13px]">Billed on challans against money received</p></div>
            <span className="tagx g">Cash {rupees(byMode.cash)} · JazzCash {rupees(byMode.jazzcash)} · Easypaisa {rupees(byMode.easypaisa)}</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2.5 rounded-[14px] bg-[#f8fafc] p-3.5 text-[14px] font-extrabold">
              <Line label="Total billed" value={rupees(due)} />
              <Line label="Collected" value={rupees(paid)} tone="text-[#15803d]" />
              <Line label="Concessions" value={rupees(concessions)} tone="text-[#4b5563]" />
              <Line label="Still to come" value={rupees(outstanding)} tone="text-[#b91c1c]" />
            </div>
            <div className="flex flex-col gap-3 md:col-span-2">
              {WINGS.filter((w) => w.due > 0).map((w) => {
                const r = w.paid / w.due;
                return (
                  <div key={w.label}>
                    <div className="mb-1 flex flex-wrap justify-between gap-x-2 text-[13px] font-extrabold"><span>{w.label}</span>
                      <span className={`tabular-nums ${r < 0.8 ? "text-[#b91c1c]" : "text-[#15803d]"}`}>{pct(r, 1)} ({rupees(w.paid)} / {rupees(w.due)})</span></div>
                    <div className="h-3 overflow-hidden rounded-full bg-[#eef2f7]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, r * 100)}%`, background: r < 0.8 ? "#ef4444" : "#16a34a" }} /></div>
                  </div>
                );
              })}
              {due === 0 && <p className="muted">No challans for this month yet.</p>}
              <div className="flex justify-end"><Link href="/accounts/calls" className="text-[13px] font-extrabold text-[#0369a1]">Defaulters list →</Link></div>
            </div>
          </div>
        </div>
        <div id="follow-up" className="card min-w-0 flex-[2_1_320px] scroll-mt-20">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div><h2 className="h2">Students to call</h2><p className="muted text-[13px]">3 or more absences in the last 3 weeks</p></div>
            {atRisk.length > 0 && <span className="tagx r">{atRisk.length} to call</span>}
          </div>
          {atRisk.length === 0 && <p className="muted">Nobody right now.</p>}
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
        </div>
      </section>

      <section className="card" style={{ borderColor: "#c4b5fd", boxShadow: "0 4px 0 #c4b5fd", background: "#fcfbff" }}>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="h2 flex items-center gap-2"><span className="ilm-tile t-v" style={{ width: 32, height: 32 }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg></span>{schoolName} today, in one line</h2>
          <span className="tagx v">From today&apos;s data</span>
        </div>
        <p className="mt-2.5 rounded-[16px_16px_16px_4px] border-2 border-[#e5e7eb] bg-white px-3.5 py-3 leading-[22px] font-bold">{summary}</p>
      </section>
    </>
  );
}

const TONES = ["t-g", "t-b", "t-v", "t-o", "t-p", "t-y"];

function Qa({ href, bg, fg, d, border, children }: { href: string; bg: string; fg: string; d: string; border?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-[84px] min-w-[104px] flex-col items-center justify-center gap-1.5 rounded-[16px] border-2 px-3 py-2 text-[13px] font-extrabold"
      style={{ background: bg, color: fg, borderColor: border ? "#e5e7eb" : "transparent" }}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>{children}
    </Link>
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

function Insight({ tile, mark, label, value }: { tile: string; mark: string; label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2.5">
      <span className={`ilm-tile ${tile} text-[13px] font-black`} style={{ width: 30, height: 30 }}>{mark}</span>
      <span className="flex-1 font-extrabold">{label}</span><span className="font-black">{value}</span>
    </div>
  );
}

function Line({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className={`flex items-center justify-between gap-2 ${tone}`}><span>{label}</span><span className="font-black tabular-nums">{value}</span></div>;
}

// Bars of the daily attendance rate, with the 90% goal as a dashed line. CSS only.
function TrendBars({ series, today }: { series: { date: string; rate: number }[]; today: string }) {
  if (series.length === 0) return <p className="muted py-10 text-center">No attendance marked in the last 30 days.</p>;
  const lo = Math.max(0, Math.floor((Math.min(GOAL, ...series.map((d) => d.rate)) - 0.05) * 10) / 10);
  const h = (r: number) => `${Math.max(2, ((r - lo) / (1 - lo)) * 100)}%`;
  const dm = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const last = series.at(-1)!;
  const label = (i: number) => i === 0 || i === series.length - 1 || i % Math.ceil(series.length / 6) === 0;
  return (
    <>
      <div role="img" aria-label={`Daily attendance for the last 30 days, latest ${pct(last.rate, 1)}`} className="relative mt-4 flex h-[200px] items-end gap-[3px] border-b-2 border-[#e5e7eb] sm:gap-1.5">
        <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-[#ef4444]/60" style={{ bottom: h(GOAL) }}>
          <span className="absolute -top-5 right-0 text-[11px] font-black text-[#b91c1c]">90% goal</span></div>
        {series.map((d) => (
          <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end" title={`${dm(d.date)}: ${pct(d.rate, 1)}`}>
            <div className="w-full max-w-[34px] rounded-t-[8px] rounded-b-[3px]" style={{ height: h(d.rate), background: d.date === today ? "#0284c7" : d.rate >= GOAL ? "#16a34a" : "#f59e0b" }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] sm:gap-1.5">
        {series.map((d, i) => <span key={d.date} className="flex-1 overflow-visible text-center text-[11px] font-extrabold whitespace-nowrap text-[#6b7280]">{label(i) ? (d.date === today ? "Today" : dm(d.date)) : ""}</span>)}
      </div>
      <p className="muted mt-2.5 text-[13px]">Green days met the 90% goal, orange fell short. Latest: {pct(last.rate, 1)}.</p>
    </>
  );
}
