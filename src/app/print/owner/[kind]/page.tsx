import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { buildReport } from "@/lib/owner-reports";
import { PrintButton } from "../../paper-check/[id]/print-button";

export default async function OwnerReportPrint({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ c?: string; p?: string }> }) {
  await requireRole("owner");
  const r = await buildReport((await params).kind, await searchParams);
  if (!r) notFound();
  const scope = r.g.camp === "all" ? "All campuses" : r.g.all.find((c) => c.id === r.g.camp)?.name;
  return (
    <div style={{ background: "#fff", minHeight: "100vh", padding: 24, fontFamily: "sans-serif" }}>
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 landscape; margin: 12mm } } table{border-collapse:collapse;width:100%;font-size:11px} th,td{border:1px solid #d1d5db;padding:4px 6px;text-align:left} th{background:#f3f4f6}`}</style>
      <div className="no-print mb-4"><PrintButton /></div>
      <h1 style={{ fontSize: 20, fontWeight: 900 }}>{r.meta.title}</h1>
      <p style={{ fontSize: 12, color: "#6b7280" }}>{scope} · {r.g.from} to {r.g.to} · printed {new Date().toLocaleDateString("en-GB")}</p>
      {r.rows.length === 0 ? <p>No records for this period.</p> : (
        <table><thead><tr>{r.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{r.rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody></table>
      )}
    </div>
  );
}
