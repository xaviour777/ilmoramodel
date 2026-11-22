import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { stateOf, healthOf, type SchoolRow, type Plan } from "@/lib/super";
import { rupees, todayPK, shortDate } from "@/lib/format";
import { PageHead, Stats, Stat, Row, Empty, Insight, Bar } from "@/components/ilm";

type S = SchoolRow & { attendance_days_30: number; payments_month: number; extras_month: number; people_7d: number; overdue: number };
type O = { students_added_month: number; by_month: { month: string; n: number }[]; collected_month: number; billed_month: number; overdue_paisa: number; overdue_schools: number };

export default async function SuperOverview() {
  const supabase = await createClient();
  const [sc, ov, pl] = await Promise.all([supabase.rpc("super_schools"), supabase.rpc("super_overview"), supabase.rpc("super_plans")]);
  const today = todayPK();
  const week = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
  const all = ((sc.data ?? []) as S[]).map((s) => ({ ...s, st: stateOf(s, today), h: healthOf(s) }));
  const o = (ov.data ?? {}) as O;
  const plans = (pl.data ?? []) as Plan[];
  const price = (id: string) => plans.find((p) => p.id === id)?.price_paisa ?? 0;
  const paying = all.filter((s) => s.st.id === "active");
  const mrr = paying.reduce((t, s) => t + price(s.plan), 0);
  const students = all.reduce((t, s) => t + s.students, 0);
  const ending = all.filter((s) => s.st.id === "trial" && s.trial_ends_on && s.trial_ends_on <= week);
  const expired = all.filter((s) => s.st.id === "expired");
  const nearLimit = all.filter((s) => s.max_students && s.students >= s.max_students * 0.9);
  const risk = all.filter((s) => s.h.score < 60 && s.st.id === "active");
  const byPlan = plans.map((p) => ({ ...p, n: paying.filter((s) => s.plan === p.id).length, total: paying.filter((s) => s.plan === p.id).length * p.price_paisa })).filter((p) => p.n > 0);
  const maxPlan = Math.max(1, ...byPlan.map((p) => p.total));
  const maxMonth = Math.max(1, ...(o.by_month ?? []).map((m) => m.n));
  const collectedPct = o.billed_month ? Math.round((o.collected_month / o.billed_month) * 100) : null;
  const todo = [
    ...ending.map((s) => ({ ini: "T", tile: "t-o", t: `${s.name}: trial ends ${s.trial_ends_on ? shortDate(s.trial_ends_on) : ""}`, d: s.students ? `${s.students} students added` : "no students added yet", tag: "Call", tc: "y", href: `/super/${s.id}` })),
    ...expired.map((s) => ({ ini: "E", tile: "t-p", t: `${s.name}: trial ended`, d: "school can't use the app until you extend or activate", tag: "Decide", tc: "r", href: `/super/${s.id}` })),
    ...(o.overdue_schools ? [{ ini: "P", tile: "t-p", t: `${o.overdue_schools} school${o.overdue_schools === 1 ? "" : "s"} overdue`, d: `${rupees(o.overdue_paisa)} not paid after the due date`, tag: "Urgent", tc: "r", href: "/super/billing?f=overdue" }] : []),
    ...nearLimit.map((s) => ({ ini: "L", tile: "t-b", t: `${s.name} near student limit`, d: `${s.students} of ${s.max_students} students`, tag: "Upsell", tc: "b", href: `/super/${s.id}` })),
    ...risk.map((s) => ({ ini: "H", tile: "t-y", t: `${s.name}: low use`, d: `health ${s.h.score} of 100`, tag: "Call", tc: "y", href: `/super/${s.id}` })),
  ];

  return (
    <>
      <PageHead kick="Platform" title="Platform overview" sub="Every school on Ilmora: growth, money, usage and health.">
        <Link href="/super/new" className="btn">Add a school</Link>
      </PageHead>
      {(sc.error || ov.error) && <div className="notice-bad">{sc.error?.message ?? ov.error?.message}</div>}
      <Stats min={160}>
        <Stat label="Schools" value={all.length} sub={`${paying.length} paying · ${all.filter((s) => s.st.id === "trial").length} on trial`} href="/super/schools" />
        <Stat label="Students" value={students.toLocaleString("en-IN")} tone="#15803d" sub={`+${(o.students_added_month ?? 0).toLocaleString("en-IN")} this month`} />
        <Stat label="Monthly revenue" value={rupees(mrr)} tone="#15803d" sub="paying schools × plan price" href="/super/plans" />
        <Stat label="Collected this month" value={rupees(o.collected_month ?? 0)} sub={collectedPct == null ? "no invoices this month" : `${collectedPct}% of ${rupees(o.billed_month)} billed`} href="/super/billing" />
        <Stat label="Overdue" value={rupees(o.overdue_paisa ?? 0)} tone={o.overdue_paisa ? "#b91c1c" : undefined} sub={`${o.overdue_schools ?? 0} school${o.overdue_schools === 1 ? "" : "s"}`} href="/super/billing?f=overdue" />
        <Stat label="Suspended or ended" value={all.filter((s) => s.st.id === "suspended" || s.st.id === "expired").length} tone={all.some((s) => s.st.id === "suspended" || s.st.id === "expired") ? "#c2410c" : undefined} sub="can't use the app" />
      </Stats>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">New schools by month</h2><span className="muted text-[12px]">last 6 months</span></div>
          <div className="mt-2.5">
            {(o.by_month ?? []).map((m, i, a) => (
              <div key={m.month} className="flex items-center gap-2 py-1 text-[13px] font-extrabold">
                <span className="w-16">{m.month}</span>
                <div className="flex-1"><Bar value={m.n / maxMonth} color={i === a.length - 1 ? "#16a34a" : "#0ea5e9"} /></div>
                <span className="w-24 text-right">{m.n}{i === a.length - 1 ? " so far" : ""}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Revenue by plan</h2><span className="muted text-[12px]">monthly, paying schools</span></div>
          <div className="mt-2.5">
            {byPlan.length === 0 && <Empty>No paying school yet, or plan prices are 0. Set prices in Plans.</Empty>}
            {byPlan.map((p) => (
              <div key={p.id} className="py-1.5 text-[13px] font-extrabold">
                <div className="mb-1 flex justify-between gap-2"><span>{p.name}</span><span>{rupees(p.total)} · {p.n} school{p.n === 1 ? "" : "s"}</span></div>
                <Bar value={p.total / maxPlan} color="#7c3aed" />
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2 className="h2">Needs you today</h2>
          {todo.length === 0 && <div className="mt-2"><Empty>Nothing waiting. All schools are fine.</Empty></div>}
          {todo.map((x, i) => (
            <Row key={i}>
              <span className={`ilm-tile ${x.tile} text-[13px] font-black`}>{x.ini}</span>
              <Link href={x.href} className="min-w-0 flex-[1_1_200px]"><div className="font-black">{x.t}</div><div className="muted text-[12px]">{x.d}</div></Link>
              <span className={`tagx ${x.tc}`}>{x.tag}</span>
            </Row>
          ))}
        </section>
        <Insight title="Growth notes">
          <ul className="ml-4 list-disc">
            <li>{all.length} school{all.length === 1 ? "" : "s"}, {students.toLocaleString("en-IN")} students. Average {all.length ? Math.round(students / all.length) : 0} students per school.</li>
            <li>{paying.length ? `Average revenue per paying school is ${rupees(mrr / paying.length)} a month.` : "No paying school yet."}{students && mrr ? ` That is ${rupees(mrr / Math.max(1, paying.reduce((t, s) => t + s.students, 0)))} per student.` : ""}</li>
            <li>{risk.length ? `${risk.length} active school${risk.length === 1 ? " has" : "s have"} a health score below 60: call them this week.` : "Every active school has a health score of 60 or more."}</li>
          </ul>
        </Insight>
      </div>
    </>
  );
}
