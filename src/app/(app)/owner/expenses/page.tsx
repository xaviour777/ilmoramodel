import Link from "next/link";
import { requireRole } from "@/lib/me";
import { loadGroup, pc, rs, type OwnerSearch } from "@/lib/owner";
import { HBars, Kpis, Notes, OwnerFilter, OwnerHead } from "@/components/owner-ui";

const COLORS = ["#0ea5e9", "#7c3aed", "#f59e0b", "#db2777", "#16a34a", "#94a3b8", "#0d9488"];

export default async function Expenses({ searchParams }: { searchParams: Promise<OwnerSearch> }) {
  await requireRole("owner");
  const sp = await searchParams;
  const g = await loadGroup(sp);
  const [{ data: heads }, { data: due }, { data: staff }] = await Promise.all([
    g.supabase.rpc("owner_expense_heads", { p_from: g.from, p_to: g.to }),
    g.supabase.from("salary_payments").select("campus_id, month, net_paisa, status").gte("month", g.from.slice(0, 8) + "01").order("month"),
    g.supabase.rpc("owner_staff"),
  ]);
  const ids = new Set(g.sel.map((c) => c.id));
  const H = ((heads ?? []) as { campus_id: string; head: string; amount: number }[]).filter((h) => ids.has(h.campus_id));
  const byHead = new Map<string, number>();
  for (const h of H) byHead.set(h.head, (byHead.get(h.head) ?? 0) + Number(h.amount));
  const payroll = g.sum((c) => c.payroll);
  if (payroll) byHead.set("Salaries", payroll);
  const total = [...byHead.values()].reduce((a, b) => a + b, 0);
  const col = g.sum((c) => c.collected), stu = g.sum((c) => c.students);
  const headNames = [...new Set(H.map((h) => h.head))].sort();
  const pay = ((due ?? []) as { campus_id: string; month: string; net_paisa: number; status: string }[]).filter((p) => ids.has(p.campus_id));
  const months = [...new Set(pay.map((p) => p.month))];
  const people = ((staff ?? []) as { campus_id: string; is_active: boolean }[]).filter((p) => ids.has(p.campus_id) && p.is_active).length;
  const notes: string[] = [];
  const per = g.sel.filter((c) => c.students).map((c) => ({ c, v: c.costs / c.students })).sort((a, b) => b.v - a.v);
  if (per.length > 1 && per[0].v > per.at(-1)!.v * 1.4) notes.push(`${per[0].c.name} spends ${rs(per[0].v)} per student, ${(per[0].v / per.at(-1)!.v).toFixed(1)}× ${per.at(-1)!.c.name}.`);
  if (col && payroll / col > 0.6) notes.push(`Salaries are ${pc(payroll / col)} of fees collected; healthy is under 60%.`);
  return (
    <>
      <OwnerHead group="Money" title="Expenses and payroll" sub="Where money goes, by campus and by head."><Link className="btn" href="/principal/staff/salaries">Run payroll</Link></OwnerHead>
      <OwnerFilter base="/owner/expenses" sp={sp} all={g.all} camp={g.camp} period={g.period} />
      <Kpis items={[
        { l: "Spending", v: rs(total), n: `${g.from} to ${g.to}` },
        { l: "Payroll", v: rs(payroll), n: `${people} staff`, c: "#c2410c" },
        { l: "Payroll / income", v: col ? pc(payroll / col) : "—", n: "healthy is under 60%", c: col && payroll / col > 0.6 ? "#c2410c" : undefined },
        { l: "Cost per student", v: stu ? rs(total / stu) : "—", n: "in this period" },
      ]} />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card"><h2 className="h2">By head</h2>
          <HBars items={[...byHead].sort((a, b) => b[1] - a[1]).map(([n, v], i) => ({ n, v, label: `${rs(v)} · ${pc(v / total)}`, c: COLORS[i % COLORS.length] }))} empty="No spending recorded in this period." /></section>
        <section className="card"><h2 className="h2">Payroll calendar</h2>
          {months.length === 0 ? <p className="muted">No salaries recorded from this period on.</p> : months.map((m) => {
            const rows = pay.filter((p) => p.month === m); const dueAmt = rows.filter((p) => p.status === "due").reduce((t, p) => t + Number(p.net_paisa), 0);
            return (<div key={m} className="flex items-center justify-between gap-2 border-t-2 py-2 text-sm font-bold" style={{ borderColor: "#f1f5f9" }}>
              <span>{new Date(m).toLocaleDateString("en-GB", { month: "long", year: "numeric" })} · {rows.length} staff</span>
              <span>{rs(rows.reduce((t, p) => t + Number(p.net_paisa), 0))} <span className={`pill ${dueAmt ? "pill-orange" : "pill-green"}`}>{dueAmt ? `${rs(dueAmt)} due` : "paid"}</span></span></div>);
          })}</section>
      </div>
      <section className="card"><h2 className="h2">By campus</h2>
        <div className="overflow-x-auto"><table className="tbl min-w-[760px]">
          <thead><tr><th>Campus</th><th>Salaries</th>{headNames.map((h) => <th key={h}>{h}</th>)}<th>Total</th><th>Per student</th></tr></thead>
          <tbody>{g.sel.map((c) => (
            <tr key={c.id}><td className="font-black">{c.name}</td><td>{rs(c.payroll)}</td>{headNames.map((h) => <td key={h}>{rs(H.filter((x) => x.campus_id === c.id && x.head === h).reduce((t, x) => t + Number(x.amount), 0))}</td>)}
              <td className="font-black">{rs(c.costs)}</td><td>{c.students ? rs(c.costs / c.students) : "—"}</td></tr>
          ))}</tbody>
        </table></div></section>
      <Notes title="AI · save money" items={notes} />
    </>
  );
}
