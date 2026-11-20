import Link from "next/link";
import { requireRole } from "@/lib/me";
import { loadGroup, pc, type OwnerSearch } from "@/lib/owner";
import { HBars, Kpis, Notes, OwnerFilter, OwnerHead } from "@/components/owner-ui";

export default async function OwnerAdmissions({ searchParams }: { searchParams: Promise<OwnerSearch> }) {
  await requireRole("owner");
  const sp = await searchParams;
  const g = await loadGroup(sp);
  const inq = g.sum((c) => c.inquiries), joined = g.sum((c) => c.joined), target = g.sum((c) => c.target ?? 0);
  const src = new Map<string, number>();
  for (const c of g.sel) for (const [k, v] of Object.entries(c.sources ?? {})) src.set(k, (src.get(k) ?? 0) + v);
  const srcTotal = [...src.values()].reduce((a, b) => a + b, 0);
  const notes: string[] = [];
  for (const c of g.sel) if (c.target && c.joined < c.target * 0.5) notes.push(`${c.name}: ${c.joined} joined of ${c.target}. ${c.inquiries ? `${pc(c.joined / c.inquiries)} of inquiries join.` : "No inquiries recorded in this period."}`);
  if (src.get("not recorded") === srcTotal && srcTotal) notes.push("Ask the front desk to record where each family heard of the school; the source column is empty.");
  return (
    <>
      <OwnerHead group="School" title="Admissions" sub="Inquiries to joined, for every campus."><Link className="btn" href="/owner/campuses">Set targets</Link></OwnerHead>
      <OwnerFilter base="/owner/admissions" sp={sp} all={g.all} camp={g.camp} period={g.period} />
      <Kpis items={[
        { l: "Inquiries", v: inq, n: `${g.from} to ${g.to}` },
        { l: "Joined", v: joined, n: inq ? `${pc(joined / inq)} conversion` : "—", c: "#15803d" },
        { l: "Target", v: target || "—", n: target ? `${pc(joined / target)} reached` : "set targets", c: "#c2410c" },
        { l: "In progress", v: g.sum((c) => c.offers - c.joined + (c.tests - c.offers)), n: "tested or offered, not joined" },
      ]} />
      <section className="card"><h2 className="h2">Funnel by campus</h2>
        <div className="overflow-x-auto"><table className="tbl min-w-[700px]"><thead><tr><th>Campus</th><th>Inquiries</th><th>Tests</th><th>Offers</th><th>Joined</th><th>Target</th><th>Reached</th></tr></thead>
          <tbody>{g.sel.map((c) => (
            <tr key={c.id}><td className="font-black">{c.name}</td><td>{c.inquiries}</td><td>{c.tests}</td><td>{c.offers}</td><td className="font-black">{c.joined}</td><td>{c.target ?? "—"}</td>
              <td className="font-black" style={{ color: c.target ? (c.joined / c.target >= 0.7 ? "#15803d" : "#b91c1c") : undefined }}>{c.target ? pc(c.joined / c.target) : "—"}</td></tr>
          ))}</tbody></table></div></section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card"><h2 className="h2">Where families come from</h2>
          <HBars items={[...src].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ n, v, label: `${v} · ${pc(v / srcTotal)}`, c: "#db2777" }))} empty="No families joined in this period." /></section>
        <Notes title="AI · fill seats" items={notes} />
      </div>
    </>
  );
}
