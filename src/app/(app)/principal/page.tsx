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

  const [days, sections, sectionToday, students, invoices, monthPayments, leave, claims, admissions, absences, notices, staffToday, staffCount, nextHoliday, owing, waiting, absentWaiting, config] = await Promise.all([
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
    supabase.from("notices").select("id, title, created_at").order("created_at", { ascending: false }).limit(3),
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
  const absentToday = markedToday - presentToday;
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
  // heatmap: one row per class, one column per section letter
  const secNames = [...new Set(secRows.map((s) => s.sec))].sort();
  const classNames = [...new Set(secRows.map((s) => s.cls))];
  const heatCols = { gridTemplateColumns: `80px repeat(${Math.max(1, secNames.length)}, minmax(0, 1fr))` };

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
  const up = yesterday && rateToday >= yesterday.rate;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        <LiveRefresh tables={["attendance", "payments", "leave_requests"]} />
        {canSend && <AutoSend waiting={waiting.count ?? 0} />}
      </div>

      {/* greeting */}
      <section className="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-sm">
        <div className="pointer-events-none absolute -top-12 -right-12 h-64 w-64 rounded-full bg-primary-fixed/30 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between gap-space-md lg:flex-row lg:items-center">
          <div className="space-y-space-xs">
            <span className="inline-flex items-center gap-1.5 rounded bg-surface-container px-2.5 py-1 text-label-sm text-on-surface-variant">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" />{me.campus_name} · {shortDate(today)}
            </span>
            <h1 className="text-headline-md tracking-tight text-primary lg:text-headline-lg">{headline}</h1>
            <p className="text-body-md text-on-surface-variant">{sub}</p>
          </div>
          {attention.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5">
              {attention.map((a) => (
                <Link key={a.title} href={a.href} className="group flex items-center gap-2 rounded-lg bg-surface-container-lowest px-3 py-2 shadow-sm transition-all hover:shadow-md">
                  <span className={`h-2.5 w-2.5 rounded-full ${a.dot}`} />
                  <span className="flex flex-col"><span className="text-label-sm text-on-surface">{a.title}</span><span className={`text-[11px] ${a.subTone}`}>{a.sub}</span></span>
                  <span className="msym text-[16px] text-outline group-hover:text-primary">chevron_right</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* summary from today's data */}
      <section className="rounded-xl bg-surface-container p-space-md shadow-sm">
        <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-center">
          <div className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-container text-primary-fixed shadow-sm"><span className="msym text-[20px]">auto_awesome</span></span>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2"><span className="text-label-md font-bold text-primary">Today in one line</span>
                <span className="rounded bg-tertiary-fixed px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-on-tertiary-fixed">FROM TODAY&apos;S DATA</span></div>
              <p className="text-body-md text-on-surface">{summary}</p>
            </div>
          </div>
          <Link href="#actions" className="flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-primary-container px-3.5 py-2 text-label-md text-on-primary shadow-sm hover:bg-primary md:self-auto">
            What to do first <span className="msym text-[16px]">chevron_right</span>
          </Link>
        </div>
      </section>

      {/* six numbers */}
      <section className="grid grid-cols-2 gap-space-sm sm:gap-space-md lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total students" badge={capacity ? `${pct(total / capacity)} FULL` : undefined} value={total.toLocaleString("en-IN")}
          sub={`Enrolled across ${secRows.length} sections`} href="/principal/classes"
          foot={capacity ? <Bar value={total / capacity} /> : undefined} />
        <Kpi label="Attendance today" badge={markedToday ? (rateToday >= GOAL ? "ON TARGET" : "BELOW 90%") : "NOT YET"} badgeTone={markedToday ? (rateToday >= GOAL ? "green" : "red") : "gray"}
          value={markedToday ? pct(rateToday, 1) : "—"}
          sub={<><b className="tabular-nums text-on-surface">{presentToday.toLocaleString("en-IN")}</b> present · <b className="tabular-nums text-error">{absentToday.toLocaleString("en-IN")}</b> absent</>}
          foot={<div className="flex items-center justify-between gap-1">
            {yesterday && markedToday ? <span title="Compared with the last school day" className={`flex items-center gap-0.5 whitespace-nowrap text-[11px] font-medium ${up ? "text-secondary" : "text-error"}`}>
              <span className="msym text-[13px]">{up ? "trending_up" : "trending_down"}</span>{up ? "+" : ""}{((rateToday - yesterday.rate) * 100).toFixed(1)}% vs last</span> : <span />}
            <Spark values={series.slice(-7).map((d) => d.rate)} className="text-secondary" />
          </div>} />
        <Kpi label="Fees collected" badge={new Date(monthStart + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).toUpperCase()}
          value={rupees(paid)} small sub={`${pct(feeRate, 1)} of ${rupees(due)} billed`} href="/accounts" foot={<Bar value={feeRate} />} />
        <Kpi label="Outstanding fees" badge={owing.count ? `${owing.count} FAMILIES` : undefined} badgeTone="red" value={rupees(Math.max(0, due - paid))} small tone="error"
          sub="Not yet paid this month" href="/accounts/calls"
          foot={<span className="text-[11px] font-medium text-outline">{due ? `${pct(1 - feeRate, 1)} still to come` : "No challans this month"}</span>} />
        <Kpi label="Pending approvals" value={`${approvals} waiting`}
          sub={claimCount ? `${rupees(claimSum)} in wallet payments to confirm` : "Leave requests and wallet payments"} href={leave.count ? "/principal/staff" : "/accounts/online"}
          foot={<span className="truncate text-[11px] text-on-surface-variant">{leave.count ?? 0} leave · {claimCount} payment{claimCount === 1 ? "" : "s"}</span>} />
        <Kpi label="Attendance alerts" badge={atRisk.length ? "CALL" : undefined} badgeTone="solid-red" value={`${atRisk.length} student${atRisk.length === 1 ? "" : "s"}`} tone={atRisk.length ? "error" : undefined}
          sub="3+ absences in the last 3 weeks" href="#follow-up"
          foot={<span className="flex items-center justify-between text-[11px] text-on-surface-variant">{absentWaiting.count ? `${absentWaiting.count} absent alerts waiting` : "No absent alerts waiting"}<span className="msym text-[16px] text-error">notification_important</span></span>} />
      </section>

      <div className="grid grid-cols-1 gap-space-lg lg:grid-cols-12">
        <div className="min-w-0 space-y-space-lg lg:col-span-8">
          {/* 30-day attendance */}
          <section className={CARD + " p-space-lg"}>
            <div className="flex flex-col justify-between gap-2 pb-space-md sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2"><h2 className="text-headline-sm font-bold text-primary">30-day attendance</h2>
                  <span className="rounded bg-surface-container px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">All sections</span></div>
                <p className="text-body-sm text-on-surface-variant">School days only, against the 90% daily goal</p>
              </div>
              <div className="flex items-center gap-4 text-label-sm text-on-surface-variant">
                <span className="flex items-center gap-2"><span className="h-0.5 w-3 bg-primary-container" />Actual</span>
                <span className="flex items-center gap-2"><span className="h-0.5 w-3 bg-error" />Goal (90%)</span>
              </div>
            </div>
            <AttendanceChart series={series} today={today} />
          </section>

          {/* fees */}
          <section className={CARD + " p-space-lg"}>
            <div className="flex flex-col justify-between gap-2 pb-space-md sm:flex-row sm:items-center">
              <div>
                <h2 className="text-headline-sm font-bold text-primary">Fees this month</h2>
                <p className="text-body-sm text-on-surface-variant">Billed on challans against money received</p>
              </div>
              <span className="inline-flex flex-wrap items-center gap-1.5 self-start rounded bg-surface-container-high px-2.5 py-1 text-label-sm text-primary">
                <span className="msym text-[14px]">payments</span>Cash {rupees(byMode.cash)} · JazzCash {rupees(byMode.jazzcash)} · Easypaisa {rupees(byMode.easypaisa)}
              </span>
            </div>
            <div className="grid grid-cols-1 items-center gap-space-md md:grid-cols-3">
              <div className="space-y-3 rounded-lg bg-surface-container-low p-space-md">
                <Line label="Total billed" value={rupees(due)} />
                <Line label="Collected" value={rupees(paid)} tone="text-secondary" />
                <Line label="Concessions" value={rupees(concessions)} tone="text-on-surface-variant" />
                <div className="pt-2"><Line label="Still to come" value={rupees(Math.max(0, due - paid))} tone="text-error" /></div>
              </div>
              <div className="space-y-3 md:col-span-2 md:pl-space-md">
                {WINGS.filter((w) => w.due > 0).map((w) => {
                  const r = w.paid / w.due;
                  return (
                    <div key={w.label}>
                      <div className="mb-1 flex flex-wrap justify-between gap-x-2 text-label-sm"><span className="text-on-surface">{w.label}</span>
                        <span className={`font-bold tabular-nums ${r < 0.8 ? "text-error" : "text-primary"}`}>{pct(r, 1)} ({rupees(w.paid)} / {rupees(w.due)})</span></div>
                      <div className="h-2 w-full rounded-full bg-surface-container-high"><div className={`h-2 rounded-full ${r < 0.8 ? "bg-error" : "bg-primary-container"}`} style={{ width: `${Math.min(100, r * 100)}%` }} /></div>
                    </div>
                  );
                })}
                {due === 0 && <p className="text-body-sm text-on-surface-variant">No challans for this month yet.</p>}
                <div className="flex justify-end pt-1">
                  <Link href="/accounts/calls" className="flex items-center gap-0.5 text-label-sm font-bold text-primary hover:underline">Defaulters list <span className="msym text-[14px]">arrow_right_alt</span></Link>
                </div>
              </div>
            </div>
          </section>

          {/* actions */}
          <section id="actions" className={CARD + " scroll-mt-20 p-space-lg"}>
            <div className="pb-space-md">
              <div className="flex items-center gap-2"><h2 className="text-headline-sm font-bold text-primary">Do these first</h2>
                {todo.length > 0 && <span className="rounded-full bg-error-container px-2 py-0.5 text-[11px] font-bold text-on-error-container">{todo.length}</span>}</div>
              <p className="text-body-sm text-on-surface-variant">Most urgent on top, for {shortDate(today)}</p>
            </div>
            {todo.length === 0 && <p className="text-body-md text-on-surface-variant">All clear. Nothing waits for you right now.</p>}
            <div className="space-y-2.5">
              {todo.map((t, i) => (
                <div key={t.title} className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg p-3.5 sm:flex-nowrap ring-1 ring-surface-variant/60 transition-colors hover:bg-surface-container-low">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-surface-container text-[11px] font-bold text-primary tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-title-md text-on-surface">{t.title}</span>
                      <span className={`hidden shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase sm:inline ${t.tone === "red" ? "bg-error-container text-on-error-container" : t.tone === "purple" ? "bg-tertiary-fixed text-on-tertiary-fixed" : "bg-surface-container text-on-surface-variant"}`}>{t.tag}</span>
                    </div>
                    <p className="mt-0.5 text-body-sm text-on-surface-variant">{t.detail}</p>
                  </div>
                  <Link href={t.href} className={`ml-8 shrink-0 rounded px-3 py-1 text-label-sm sm:ml-0 transition-colors ${i === 0 ? "bg-primary text-on-primary hover:bg-primary-container" : "bg-surface-container-high text-primary hover:bg-surface-container"}`}>{t.action}</Link>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-space-lg lg:col-span-4">
          {/* heatmap */}
          <section className={CARD + " p-space-md"}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div><h2 className="text-headline-sm font-bold text-primary">Class attendance today</h2>
                <p className="text-body-sm text-on-surface-variant">Each box is one section</p></div>
              {unmarked.length > 0 && <span className="shrink-0 rounded bg-error-container/60 px-1.5 py-0.5 text-label-sm font-bold text-error">{unmarked.length} not marked</span>}
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-surface-container-low p-2 text-[10px] font-semibold text-on-surface-variant">
              <Legend c="bg-secondary" t="95%+" /><Legend c="bg-secondary-fixed-dim" t="90-95%" /><Legend c="bg-tertiary-fixed-dim" t="Below 90%" /><Legend c="bg-outline-variant" t="Not marked" />
            </div>
            <div className="space-y-1.5">
              <div className="grid gap-1 text-center text-[10px] font-bold uppercase text-outline" style={heatCols}>
                <span className="text-left">Class</span>{secNames.map((n) => <span key={n}>Sec {n}</span>)}
              </div>
              {classNames.map((c) => (
                <div key={c} className="grid items-center gap-1 text-center" style={heatCols}>
                  <span className="truncate text-left text-[11px] font-semibold text-on-surface">{c}</span>
                  {secNames.map((n) => {
                    const s = secRows.find((r) => r.cls === c && r.sec === n);
                    if (!s) return <span key={n} />;
                    if (!s.marked) return <span key={n} className="rounded bg-outline-variant py-1 text-[10px] font-bold text-on-surface-variant">PENDING</span>;
                    const cls = s.rate >= 0.95 ? "bg-secondary text-on-secondary" : s.rate >= GOAL ? "bg-secondary-fixed-dim text-primary" : "bg-tertiary-fixed-dim text-primary";
                    return <span key={n} className={`rounded py-1 text-[11px] font-semibold tabular-nums ${cls}`}>{pct(s.rate)}</span>;
                  })}
                </div>
              ))}
              {classNames.length === 0 && <p className="text-body-sm text-on-surface-variant">No sections yet.</p>}
            </div>
          </section>

          {/* students to call */}
          <section id="follow-up" className={CARD + " scroll-mt-20 p-space-md"}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div><h2 className="text-headline-sm font-bold text-primary">Students to call</h2>
                <p className="text-body-sm text-on-surface-variant">3 or more absences in the last 3 weeks</p></div>
              {atRisk.length > 0 && <span className="shrink-0 rounded bg-error px-1.5 py-0.5 text-[10px] font-bold text-on-error">{atRisk.length} ACTIVE</span>}
            </div>
            {atRisk.length === 0 && <p className="text-body-sm text-on-surface-variant">Nobody right now.</p>}
            <div className="space-y-3">
              {atRisk.slice(0, 5).map((s) => (
                <div key={s.id} className="flex flex-col gap-2 rounded-lg bg-surface-container-low p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="truncate text-title-md font-bold text-on-surface">{s.name}</div>
                      <div className="text-[11px] text-on-surface-variant">{s.roll ? `Roll #${s.roll} · ` : ""}{s.cls}</div></div>
                    <span className="shrink-0 rounded bg-error-container px-2 py-0.5 text-[11px] font-bold text-on-error-container">{s.n} days absent</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 text-[12px] text-on-surface-variant">
                    <span className="flex min-w-0 items-center gap-1"><span className="msym text-[14px]">call</span><span className="truncate">{s.phone ?? "No phone saved"}</span></span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-on-primary hover:bg-primary-container">Call</a>}
                      <Link href={`/principal/students/${s.id}`} className="rounded bg-surface-container-high px-2 py-1 text-[11px] font-semibold text-primary hover:bg-surface-container">View file</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {atRisk.length > 5 && <p className="mt-3 text-center text-label-sm text-on-surface-variant">and {atRisk.length - 5} more</p>}
          </section>

          {/* campus today */}
          <section className={CARD + " p-space-md"}>
            <h2 className="pb-3 text-headline-sm font-bold text-primary">Campus today</h2>
            <div className="space-y-2.5 text-body-sm">
              <Row icon="badge" label="Staff present" href="/principal/staff"
                value={staffMarked ? `${staffPresent} / ${staffTotal} (${pct(staffPresent / Math.max(1, staffTotal))})` : "Not marked yet"} tone={staffMarked ? "text-on-surface" : "text-error"} />
              <Row icon="person_add" label="Admissions in progress" href="/principal/admissions" value={String(admissions.count ?? 0)} />
              <Row icon="event" label="Next holiday" href="/settings" value={nextHoliday.data ? `${nextHoliday.data.title}, ${shortDate(nextHoliday.data.starts_on)}` : "None this week"} />
              <Row icon="forum" label="Messages waiting to send" href="/accounts/messages" value={String(waiting.count ?? 0)} />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-surface-variant pt-3">
              <span className="text-label-md font-bold text-primary">Latest notices</span>
              <Link href="/principal/notices" className="text-label-sm font-bold text-primary hover:underline">New notice</Link>
            </div>
            <div className="mt-2 space-y-1">
              {(notices.data ?? []).map((n) => <div key={n.id} className="truncate text-body-sm text-on-surface">{n.title}</div>)}
              {(notices.data ?? []).length === 0 && <p className="text-body-sm text-on-surface-variant">No notices yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

const CARD = "rounded-xl bg-surface-container-lowest shadow-sm ring-1 ring-surface-variant/60";

type Tone = "green" | "red" | "solid-red" | "gray";
const BADGE: Record<Tone, string> = {
  green: "bg-secondary-fixed text-on-secondary-fixed-variant font-bold",
  red: "bg-error-container text-on-error-container font-bold",
  "solid-red": "bg-error text-on-error font-bold",
  gray: "bg-surface-container-high text-on-surface-variant",
};

function Kpi({ label, value, sub, foot, badge, badgeTone = "gray", tone, small, href }: {
  label: string; value: string; sub: React.ReactNode; foot?: React.ReactNode; badge?: string; badgeTone?: Tone; tone?: "error"; small?: boolean; href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">{label}</span>
        {badge && <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] ${BADGE[badgeTone]}`}>{badge}</span>}
      </div>
      <div className="my-space-xs">
        <div className={`font-bold tabular-nums ${small ? "text-[20px] leading-8" : "text-headline-lg"} ${tone === "error" ? "text-error" : "text-primary"}`}>{value}</div>
        <div className="text-[12px] text-on-surface-variant">{sub}</div>
      </div>
      {foot && <div className="pt-1">{foot}</div>}
    </>
  );
  const cls = CARD + " flex min-w-0 flex-col justify-between p-space-md transition-shadow hover:shadow-md";
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Bar({ value }: { value: number }) {
  return <div className="mt-2 h-1.5 w-full rounded-full bg-surface-container-high"><div className="h-1.5 rounded-full bg-primary-container" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} /></div>;
}

function Spark({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 0.01;
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * 62 + 1).toFixed(1)} ${(18 - ((v - lo) / span) * 16).toFixed(1)}`).join(" ");
  return <svg className={`h-5 w-16 shrink-0 ${className ?? ""}`} viewBox="0 0 64 20" fill="none" aria-hidden="true"><path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Line({ label, value, tone = "text-primary" }: { label: string; value: string; tone?: string }) {
  return <div className={`flex items-center justify-between gap-2 ${tone}`}><span className="text-label-sm">{label}</span><span className="text-label-md font-bold tabular-nums">{value}</span></div>;
}

function Legend({ c, t }: { c: string; t: string }) {
  return <span className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded ${c}`} />{t}</span>;
}

function Row({ icon, label, value, href, tone = "text-on-surface" }: { icon: string; label: string; value: string; href: string; tone?: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-2 rounded bg-surface-container-low p-2 hover:bg-surface-container">
      <span className="flex items-center gap-2"><span className="msym text-[18px] text-primary">{icon}</span><span className="font-medium text-on-surface">{label}</span></span>
      <span className={`text-right text-label-sm tabular-nums ${tone}`}>{value}</span>
    </Link>
  );
}

// Line chart of the daily attendance rate, with the 90% goal as a dashed line.
function AttendanceChart({ series, today }: { series: { date: string; rate: number }[]; today: string }) {
  if (series.length === 0) return <p className="py-10 text-center text-body-sm text-on-surface-variant">No attendance marked in the last 30 days.</p>;
  const W = 760, H = 180, L = 36, R = 12, T = 12, B = 160;
  const lo = Math.max(0, Math.floor((Math.min(GOAL, ...series.map((d) => d.rate)) - 0.03) * 20) / 20);
  const y = (r: number) => B - ((r - lo) / (1 - lo)) * (B - T);
  const x = (i: number) => (series.length === 1 ? (L + W - R) / 2 : L + (i / (series.length - 1)) * (W - R - L));
  const line = "M " + series.map((d, i) => `${x(i).toFixed(1)} ${y(d.rate).toFixed(1)}`).join(" L ");
  const area = `${line} L ${x(series.length - 1).toFixed(1)} ${B} L ${x(0).toFixed(1)} ${B} Z`;
  const ticks = [1, (1 + lo) / 2, lo];
  const last = series.at(-1)!;
  const n = series.length - 1;
  const labelIdx = [...new Set([0, Math.round(n / 4), Math.round(n / 2), Math.round((n * 3) / 4), n])];
  const dm = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  return (
    <>
      <div className="relative h-56 w-full pt-2">
        <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Daily attendance for the last 30 days, latest ${pct(last.rate, 1)}`}>
          <defs><linearGradient id="attGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#103D37" stopOpacity="0.18" /><stop offset="100%" stopColor="#103D37" stopOpacity="0" /></linearGradient></defs>
          {ticks.map((t) => <line key={t} x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="#E6ECE8" strokeDasharray="3 3" />)}
          <line x1={L} x2={W} y1={B} y2={B} stroke="#E6ECE8" />
          <line x1={L} x2={W} y1={y(GOAL)} y2={y(GOAL)} stroke="#ba1a1a" strokeDasharray="5 4" strokeWidth="1.5" opacity="0.7" />
          <path d={area} fill="url(#attGradient)" />
          <path d={line} fill="none" stroke="#103D37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {series.map((d, i) => d.rate < GOAL && <circle key={d.date} cx={x(i)} cy={y(d.rate)} r="3" fill="#ba1a1a"><title>{`${shortDate(d.date)}: ${pct(d.rate, 1)}`}</title></circle>)}
          <circle cx={x(n)} cy={y(last.rate)} r="5" fill="#006d3b" />
          <circle cx={x(n)} cy={y(last.rate)} r="9" fill="none" stroke="#006d3b" strokeWidth="1.5" opacity="0.5" />
        </svg>
        {/* y labels outside the stretched svg so the text keeps its shape */}
        {ticks.map((t) => <span key={t} className="absolute left-0 -translate-y-1/2 text-[10px] text-outline" style={{ top: `calc(0.5rem + (100% - 0.5rem) * ${(y(t) / H).toFixed(3)})` }}>{pct(t)}</span>)}
      </div>
      <div className="flex items-center justify-between gap-2 px-2 pt-2 text-[11px] font-semibold text-outline">
        {labelIdx.map((i, k) => (
          <span key={series[i].date} className={i === n ? "font-bold text-primary" : k % 2 ? "hidden sm:inline" : ""}>
            {i === n ? `${series[i].date === today ? "Today" : dm(series[i].date)} · ${pct(series[i].rate, 1)}` : dm(series[i].date)}
          </span>
        ))}
      </div>
    </>
  );
}
