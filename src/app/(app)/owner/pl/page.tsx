import { requireRole } from "@/lib/me";
import { loadGroup, pc, rs, type OwnerSearch } from "@/lib/owner";
import { HBars, Kpis, Notes, OwnerFilter, OwnerHead } from "@/components/owner-ui";
import { PrintButton } from "@/app/print/paper-check/[id]/print-button";

export default async function PL({ searchParams }: { searchParams: Promise<OwnerSearch> }) {
  await requireRole("owner");
  const sp = await searchParams;
  const g = await loadGroup(sp);
  const { data: heads } = await g.supabase.rpc("owner_expense_heads", { p_from: g.from, p_to: g.to });
  const H = (heads ?? []) as { campus_id: string; head: string; amount: number }[];
  const names = [...new Set(H.filter((h) => g.sel.some((c) => c.id === h.campus_id)).map((h) => h.head))].sort();
  const cell = (cid: string | null, f: (c: (typeof g.sel)[number]) => number) => cid ? f(g.sel.find((c) => c.id === cid)!) : g.sum(f);
  const head = (cid: string | null, h: string) => H.filter((x) => x.head === h && (cid ? x.campus_id === cid : g.sel.some((c) => c.id === x.campus_id))).reduce((t, x) => t + Number(x.amount), 0);
  const cols: (string | null)[] = [...g.sel.map((c) => c.id), ...(g.sel.length > 1 ? [null] : [])];
  const k = (v: number) => (Math.round(v / 100000)).toLocaleString("en-PK");
  const inc = g.sum((c) => c.collected), cost = g.sum((c) => c.costs), net = inc - cost;
  const notes: string[] = [];
  for (const c of g.sel) if (c.collected || c.costs) if (c.profit < 0) notes.push(`${c.name} made a loss of ${rs(-c.profit)}${c.status === "opening" ? " (set-up costs before opening)" : ""}.`);
  const best = [...g.sel].filter((c) => c.margin != null).sort((a, b) => b.margin! - a.margin!)[0];
  if (best) notes.push(`${best.name} has the best margin: ${pc(best.margin)}.`);
  return (
    <>
      <OwnerHead group="Money" title="Profit and loss" sub="Income minus every cost, by campus. Income is fees received (cash basis)."><PrintButton /></OwnerHead>
      <OwnerFilter base="/owner/pl" sp={sp} all={g.all} camp={g.camp} period={g.period} />
      <Kpis items={[
        { l: "Income", v: rs(inc), n: "fees received", c: "#15803d" },
        { l: "Costs", v: rs(cost), n: "expenses + salaries", c: "#c2410c" },
        { l: "Net", v: rs(net), n: `${g.from} to ${g.to}`, c: net < 0 ? "#b91c1c" : "#15803d" },
        { l: "Margin", v: inc ? pc(net / inc) : "—", n: "net ÷ income" },
      ]} />
      <section className="card">
        <h2 className="h2">Statement · Rs thousands</h2>
        <div className="overflow-x-auto"><table className="tbl min-w-[700px]">
          <thead><tr><th>Line</th>{cols.map((c) => <th key={c ?? "g"}>{c ? g.sel.find((x) => x.id === c)!.name : "Group"}</th>)}</tr></thead>
          <tbody>
            <tr><td>Fees received</td>{cols.map((c) => <td key={c ?? "g"}>{k(cell(c, (x) => x.collected))}</td>)}</tr>
            <tr className="font-black"><td>Total income</td>{cols.map((c) => <td key={c ?? "g"}>{k(cell(c, (x) => x.collected))}</td>)}</tr>
            <tr><td>Salaries</td>{cols.map((c) => <td key={c ?? "g"}>{k(cell(c, (x) => x.payroll))}</td>)}</tr>
            {names.map((h) => <tr key={h}><td>{h}</td>{cols.map((c) => <td key={c ?? "g"}>{k(head(c, h))}</td>)}</tr>)}
            <tr className="font-black"><td>Total costs</td>{cols.map((c) => <td key={c ?? "g"}>{k(cell(c, (x) => x.costs))}</td>)}</tr>
            <tr className="font-black" style={{ borderTop: "3px solid #1f2937" }}><td>Net profit</td>{cols.map((c) => { const v = cell(c, (x) => x.profit); return <td key={c ?? "g"} style={{ color: v < 0 ? "#b91c1c" : "#15803d" }}>{v < 0 ? "− " : "+ "}{k(Math.abs(v))}</td>; })}</tr>
          </tbody>
        </table></div>
        <p className="muted text-xs">Concessions given ({rs(g.sum((c) => c.concessions))}) are already left out of fees received.</p>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card"><h2 className="h2">Margin by campus</h2>
          <HBars items={g.sel.filter((c) => c.collected || c.costs).map((c) => ({ n: c.name, v: c.margin ?? -1, label: c.margin == null ? "costs only" : pc(c.margin), c: c.margin == null ? "#c4b5fd" : c.margin < 0 ? "#ef4444" : c.margin < 0.1 ? "#f59e0b" : "#16a34a" }))} /></section>
        <Notes title="AI · what drives the result" items={notes} />
      </div>
    </>
  );
}
