import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { pct, rupees, shortDate, todayPK } from "@/lib/format";
import { PageHead, Chips, Empty } from "@/components/ilm";
import { PrintButton } from "@/app/print/paper-check/[id]/print-button";

type Search = { r?: string; period?: string; from?: string; to?: string };
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const REPORTS = [
  { id: "day", n: "Day close", d: "Cash, online and expenses", tile: "t-g", page: "/accounts/day-close" },
  { id: "fee", n: "Fee collection", d: "Billed vs collected by class", tile: "t-o", page: "/accounts" },
  { id: "att", n: "Attendance", d: "Students by section", tile: "t-o", page: "/principal/attendance" },
  { id: "res", n: "Results", d: "Published marks by section", tile: "t-v", page: "/principal/exams?tab=results" },
  { id: "pay", n: "Payroll", d: "Salaries and deductions", tile: "t-b", page: "/principal/staff/salaries" },
  { id: "pl", n: "Income and costs", d: "Money in minus money out", tile: "t-g", page: "/accounts/expenses" },
  { id: "adm", n: "Admissions", d: "Inquiries to joined, by class", tile: "t-p", page: "/principal/admissions" },
  { id: "staff", n: "Staff attendance", d: "Present, leave, late, cover", tile: "t-b", page: "/principal/staff?tab=reports" },
];
type Out = { k: [string, string][]; head: string[]; rows: string[][] };

// Every report in one place (design/Reports.dc.html): pick one, set the dates, print it.
export default async function PrincipalReports({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const today = todayPK();
  const cur = REPORTS.find((r) => r.id === sp.r) ?? REPORTS[0];
  const weekday = ((new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
  const period = ["today", "week", "month", "custom"].includes(sp.period ?? "") ? sp.period! : cur.id === "day" ? "today" : "month";
  const from = period === "today" ? today : period === "week" ? iso(Date.parse(today) - (weekday - 1) * DAY) : period === "custom" && isDate(sp.from) ? sp.from! : today.slice(0, 8) + "01";
  const to = period === "custom" && isDate(sp.to) && sp.to! >= from ? sp.to! : today;
  const out = await build(cur.id, from, to);
  const href = (o: Search) => "/principal/reports?" + new URLSearchParams(Object.entries({ r: cur.id, period, ...o }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <PageHead kick="Money" title="Reports" sub="Every report in one place. Pick one, set the dates, then print or open the full page." />
      <section className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {REPORTS.map((r) => (
          <Link key={r.id} href={`/principal/reports?r=${r.id}`} scroll={false} aria-current={r.id === cur.id ? "true" : undefined}
            className={`card flex flex-col gap-1.5 ${r.id === cur.id ? "!border-[#7dd3fc] !bg-[#f0f9ff] !shadow-[0_4px_0_#7dd3fc]" : "hover:border-[#cbd5e1]"}`}>
            <span className={`ilm-tile ${r.tile} text-[18px] font-black`} style={{ width: 44, height: 44, borderRadius: 14 }}>{r.n[0]}</span>
            <span className="font-black">{r.n}</span><span className="muted text-[12px]">{r.d}</span>
          </Link>
        ))}
      </section>
      <p className="muted -mt-2 text-[13px] font-extrabold">More: <Link href="/principal/attendance" className="text-[#0369a1] underline">Attendance trend and analysis</Link> · <Link href="/accounts/forecast" className="text-[#0369a1] underline">Who may pay late (forecast)</Link> · <Link href="/accounts/calls" className="text-[#0369a1] underline">Defaulters</Link></p>
      <section className="card flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="h2">{cur.n} · {from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`}</h2>
          <div className="flex flex-wrap gap-2"><PrintButton /><Link href={cur.page} className="btn-ghost">Open full page</Link></div>
        </div>
        <div className="flex flex-wrap items-end gap-2.5">
          <Chips label="Period" current={period} items={[["today", "Today"], ["week", "Week"], ["month", "Month"], ["custom", "Custom"]].map(([id, label]) => ({ id, label, href: href({ period: id }) }))} />
          {period === "custom" && (
            <form className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="r" value={cur.id} /><input type="hidden" name="period" value="custom" />
              <label className="field">From<input className="input" type="date" name="from" defaultValue={from} max={today} /></label>
              <label className="field">To<input className="input" type="date" name="to" defaultValue={to} max={today} /></label>
              <button className="btn-ghost" type="submit">Show</button>
            </form>
          )}
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {out.k.map(([l, v]) => <div key={l} className="rounded-[16px] border-2 border-[#e5e7eb] p-3.5"><div className="kick">{l}</div><div className="mt-1 text-[24px] font-black tabular-nums">{v}</div></div>)}
        </div>
        {out.rows.length ? (
          <div className="tbl overflow-x-auto"><table className="w-full">
            <thead><tr>{out.head.map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
            <tbody>{out.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "tabular-nums" : "font-black"}>{c}</td>)}</tr>)}</tbody>
          </table></div>
        ) : <Empty>Nothing recorded in this period.</Empty>}
      </section>
    </>
  );
}

async function build(id: string, from: string, to: string): Promise<Out> {
  const supabase = await createClient();
  const start = new Date(from + "T00:00:00+05:00").toISOString();
  const end = new Date(Date.parse(to + "T00:00:00+05:00") + DAY).toISOString();
  const sum = (xs: { amount_paisa: number | string }[]) => xs.reduce((t, x) => t + Number(x.amount_paisa), 0);
  if (id === "day" || id === "pl") {
    const [{ data: pays }, { data: exps }, { data: sal }] = await Promise.all([
      supabase.from("payments").select("amount_paisa, mode, received_at, receipt_no, families(name)").gte("received_at", start).lt("received_at", end).order("received_at"),
      supabase.from("expenses").select("amount_paisa, spent_on, paid_to, expense_categories(name)").gte("spent_on", from).lte("spent_on", to),
      supabase.from("salary_payments").select("net_paisa, paid_on").eq("status", "paid").gte("paid_on", from).lte("paid_on", to),
    ]);
    const p = pays ?? [], e = exps ?? [];
    const cash = sum(p.filter((x) => x.mode === "cash")), inc = sum(p), ex = sum(e), salaries = (sal ?? []).reduce((t, s) => t + Number(s.net_paisa), 0);
    if (id === "day") return {
      k: [["Received", rupees(inc)], ["Cash", rupees(cash)], ["Online", rupees(inc - cash)], ["Expenses", rupees(ex)]],
      head: ["Time", "Receipt", "Family", "Amount"],
      rows: (p as unknown as { amount_paisa: number; received_at: string; receipt_no: string | null; families: { name: string } | null }[]).map((x) => [new Date(x.received_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), x.receipt_no ?? "—", x.families?.name ?? "", rupees(Number(x.amount_paisa))]),
    };
    const byCat = [...(e as unknown as { amount_paisa: number; expense_categories: { name: string } | null }[]).reduce((m, x) => m.set(x.expense_categories?.name ?? "Other", (m.get(x.expense_categories?.name ?? "Other") ?? 0) + Number(x.amount_paisa)), new Map<string, number>()).entries()];
    return {
      k: [["Fees received", rupees(inc)], ["Salaries paid", rupees(salaries)], ["Other costs", rupees(ex)], ["Net", rupees(inc - salaries - ex)]],
      head: ["Head", "In", "Out", ""],
      rows: [["Fees", rupees(inc), "", ""], ...(salaries ? [["Salaries", "", rupees(salaries), ""]] : []), ...byCat.sort((a, b) => b[1] - a[1]).map(([n, v]) => [n, "", rupees(v), ""])],
    };
  }
  if (id === "fee") {
    const { data: inv } = await supabase.from("invoices").select("invoice_lines(amount_paisa, students(sections(classes(name, sort)))), payments(amount_paisa)").gte("billing_month", from.slice(0, 8) + "01").lte("billing_month", to);
    const by = new Map<string, { sort: number; due: number; paid: number }>();
    let due = 0, paid = 0;
    for (const i of (inv ?? []) as unknown as { invoice_lines: { amount_paisa: number; students: { sections: { classes: { name: string; sort: number } } | null } | null }[]; payments: { amount_paisa: number }[] }[]) {
      const d = i.invoice_lines.reduce((t, l) => t + Number(l.amount_paisa), 0), pd = Math.min(d, sum(i.payments));
      due += d; paid += pd;
      for (const l of i.invoice_lines) { const c = l.students?.sections?.classes; if (!c || d <= 0) continue; const x = by.get(c.name) ?? { sort: c.sort, due: 0, paid: 0 }; x.due += Number(l.amount_paisa); x.paid += pd * Number(l.amount_paisa) / d; by.set(c.name, x); }
    }
    return {
      k: [["Billed", rupees(due)], ["Collected", rupees(paid)], ["Rate", due ? pct(paid / due) : "—"], ["Due", rupees(Math.max(0, due - paid))]],
      head: ["Class", "Billed", "Collected", "Rate"],
      rows: [...by.entries()].sort((a, b) => a[1].sort - b[1].sort).map(([n, x]) => [n, rupees(x.due), rupees(Math.round(x.paid)), x.due ? pct(x.paid / x.due) : "—"]),
    };
  }
  if (id === "att") {
    const [{ data: d }, { data: secs }, { count: late }, { data: staff }] = await Promise.all([
      supabase.from("attendance_by_section_day").select("section_id, date, present, marked").gte("date", from).lte("date", to),
      supabase.from("sections").select("id, name, classes(name, sort)"),
      supabase.from("attendance").select("id", { count: "exact", head: true }).eq("status", "late").gte("date", from).lte("date", to),
      supabase.from("staff_attendance").select("status").gte("date", from).lte("date", to),
    ]);
    const rows = d ?? [];
    const m = rows.reduce((t, x) => t + x.marked, 0), pr = rows.reduce((t, x) => t + x.present, 0);
    const st = staff ?? [];
    type S = { id: string; name: string; classes: { name: string; sort: number } };
    const list = ((secs ?? []) as unknown as S[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name)).map((s) => {
      const r = rows.filter((x) => x.section_id === s.id && x.marked);
      const low = [...r].sort((a, b) => a.present / a.marked - b.present / b.marked)[0];
      const mm = r.reduce((t, x) => t + x.marked, 0);
      return [`${s.classes.name}-${s.name}`, String(r.length), mm ? pct(r.reduce((t, x) => t + x.present, 0) / mm) : "—", low ? `${new Date(low.date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} ${pct(low.present / low.marked)}` : "—"];
    }).filter((r) => r[1] !== "0");
    return {
      k: [["Students", m ? pct(pr / m, 1) : "—"], ["Staff", st.length ? pct(st.filter((x) => x.status === "present" || x.status === "late").length / st.length) : "—"], ["Late", String(late ?? 0)], ["School days", String(new Set(rows.map((x) => x.date)).size)]],
      head: ["Section", "Days", "Average", "Lowest day"], rows: list,
    };
  }
  if (id === "res") {
    const { data: exams } = await supabase.from("exams").select("id, total_marks").eq("status", "results").gte("ends_on", from).lte("ends_on", to);
    const tm = new Map((exams ?? []).map((e) => [e.id, e.total_marks || 100]));
    const { data: marks } = tm.size ? await supabase.from("marks").select("exam_id, obtained, student_id, students(sections(name, classes(name, sort)))").in("exam_id", [...tm.keys()]).eq("is_absent", false).not("obtained", "is", null).limit(30000) : { data: [] };
    type M = { exam_id: string; obtained: number; student_id: string; students: { sections: { name: string; classes: { name: string; sort: number } } | null } };
    const ms = ((marks ?? []) as unknown as M[]).map((x) => ({ ...x, r: Number(x.obtained) / (tm.get(x.exam_id) ?? 100) }));
    const per = new Map<string, number[]>();
    for (const x of ms) per.set(x.student_id, [...(per.get(x.student_id) ?? []), x.r]);
    const stu = [...per.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
    const bySec = new Map<string, { sort: number; v: number[] }>();
    for (const x of ms) { const s = x.students.sections; if (!s) continue; const k = `${s.classes.name}-${s.name}`; const c = bySec.get(k) ?? { sort: s.classes.sort, v: [] }; c.v.push(x.r); bySec.set(k, c); }
    return {
      k: [["Average", stu.length ? pct(stu.reduce((a, b) => a + b, 0) / stu.length) : "—"], ["Pass (40%+)", stu.length ? pct(stu.filter((s) => s >= 0.4).length / stu.length) : "—"], ["A+ / A", String(stu.filter((s) => s >= 0.7).length)], ["Below 40%", String(stu.filter((s) => s < 0.4).length)]],
      head: ["Section", "Average", "Marks", "Below 40%"],
      rows: [...bySec.entries()].sort((a, b) => a[1].sort - b[1].sort).map(([k, c]) => [k, pct(c.v.reduce((a, b) => a + b, 0) / c.v.length), String(c.v.length), String(c.v.filter((r) => r < 0.4).length)]),
    };
  }
  if (id === "pay") {
    const { data } = await supabase.from("salary_payments").select("basic_paisa, allowance_paisa, bonus_paisa, absence_cut_paisa, other_cut_paisa, advance_cut_paisa, net_paisa, status, profiles!salary_payments_profile_id_fkey(full_name, role)").gte("month", from.slice(0, 8) + "01").lte("month", to);
    type P = { basic_paisa: number; allowance_paisa: number; bonus_paisa: number; absence_cut_paisa: number; other_cut_paisa: number; advance_cut_paisa: number; net_paisa: number; status: string; profiles: { full_name: string; role: string } | null };
    const ps = (data ?? []) as unknown as P[];
    const gross = ps.reduce((t, p) => t + Number(p.basic_paisa) + Number(p.allowance_paisa) + Number(p.bonus_paisa), 0);
    const cuts = ps.reduce((t, p) => t + Number(p.absence_cut_paisa) + Number(p.other_cut_paisa) + Number(p.advance_cut_paisa), 0);
    return {
      k: [["Gross", rupees(gross)], ["Deductions", rupees(cuts)], ["Net", rupees(ps.reduce((t, p) => t + Number(p.net_paisa), 0))], ["Staff", String(ps.length)]],
      head: ["Staff", "Role", "Net", "Status"],
      rows: ps.map((p) => [p.profiles?.full_name ?? "", p.profiles?.role ?? "", rupees(Number(p.net_paisa)), p.status === "paid" ? "Paid" : "Due"]),
    };
  }
  if (id === "adm") {
    const { data } = await supabase.from("admissions").select("status, classes(name, sort)").gte("created_at", start).lt("created_at", end);
    const rows = (data ?? []) as unknown as { status: string; classes: { name: string; sort: number } | null }[];
    const by = new Map<string, { sort: number; n: number; j: number }>();
    for (const r of rows) { const k = r.classes?.name ?? "Not sure"; const c = by.get(k) ?? { sort: r.classes?.sort ?? 99, n: 0, j: 0 }; c.n++; if (r.status === "admitted") c.j++; by.set(k, c); }
    const joined = rows.filter((r) => r.status === "admitted").length;
    return {
      k: [["Inquiries", String(rows.length)], ["Tests", String(rows.filter((r) => r.status === "test").length)], ["Joined", String(joined)], ["Conversion", rows.length ? pct(joined / rows.length) : "—"]],
      head: ["Class", "Inquiries", "Joined", "Rate"],
      rows: [...by.entries()].sort((a, b) => a[1].sort - b[1].sort).map(([k, c]) => [k, String(c.n), String(c.j), pct(c.j / c.n)]),
    };
  }
  // staff attendance
  const [{ data: rows }, { count: covered }] = await Promise.all([
    supabase.from("staff_attendance").select("status, profiles(full_name)").gte("date", from).lte("date", to),
    supabase.from("substitutions").select("id", { count: "exact", head: true }).gte("date", from).lte("date", to).not("substitute_id", "is", null),
  ]);
  const rs = (rows ?? []) as unknown as { status: string; profiles: { full_name: string } | null }[];
  const by = new Map<string, Record<string, number>>();
  for (const r of rs) { const k = r.profiles?.full_name ?? ""; const c = by.get(k) ?? {}; c[r.status] = (c[r.status] ?? 0) + 1; by.set(k, c); }
  const n = (s: string) => rs.filter((r) => r.status === s).length;
  return {
    k: [["Present", rs.length ? pct((n("present") + n("late")) / rs.length) : "—"], ["Leave days", String(n("leave"))], ["Late", String(n("late"))], ["Covered", String(covered ?? 0)]],
    head: ["Staff", "Present", "Leave", "Late"],
    rows: [...by.entries()].sort().map(([k, c]) => [k, String((c.present ?? 0) + (c.late ?? 0)), String(c.leave ?? 0), String(c.late ?? 0)]),
  };
}
