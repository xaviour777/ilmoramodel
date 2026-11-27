import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { REPORT, CATEGORIES } from "@/lib/reports/catalog";
import { cell, readFilters, runReport, totals, visibleCols } from "@/lib/reports/run";
import { PrintButton } from "../paper-check/[id]/print-button";

const d = (v?: string) => v ? new Date(v + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

// One Report Center report on paper, with the school name, the filters used and the date printed.
export default async function PrintReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireRole("principal", "owner", "accountant");
  const sp = await searchParams;
  const r = REPORT.get(sp.r ?? "");
  if (!r || r.link) notFound();
  const supabase = await createClient();
  const f = readFilters(r, sp);
  const [{ rows, error }, { data: camp }] = await Promise.all([
    runReport(supabase, r, f),
    supabase.from("campuses").select("name, schools(name, logo_url)").eq("id", me.campus_id).maybeSingle(),
  ]);
  if (!error) await supabase.from("report_runs").insert({ report_id: r.id, filters: f, via: "print", row_count: rows.length });
  const cols = visibleCols(r, f, rows);
  const sum = totals(cols, rows);
  const school = (camp?.schools as unknown as { name: string; logo_url: string | null } | null);
  const [secs, exam] = await Promise.all([
    f.section || f.class ? supabase.from("sections").select("id, name, classes(id, name)").then(({ data }) => data ?? []) : Promise.resolve([]),
    f.exam ? supabase.from("exams").select("name").eq("id", f.exam).maybeSingle().then(({ data }) => data?.name ?? "") : Promise.resolve(""),
  ]);
  type S = { id: string; name: string; classes: { id: string; name: string } };
  const ss = secs as unknown as S[];
  const scope = [
    f.from ? `${d(f.from)} to ${d(f.to)}` : f.to ? d(f.to) : "", f.month ? new Date(f.month + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : "",
    exam, f.section ? ss.find((s) => s.id === f.section)?.classes.name + "-" + ss.find((s) => s.id === f.section)?.name : f.class ? ss.find((s) => s.classes.id === f.class)?.classes.name : "",
    f.status ? r.status?.options.find(([v]) => v === f.status)?.[1] : "",
  ].filter(Boolean).join(" · ");
  const num = (t?: string) => t === "money" || t === "int" || t === "pct" || t === "num";
  return (
    <div style={{ background: "#fff", minHeight: "100vh", padding: 24, fontFamily: "sans-serif", color: "#111" }}>
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 ${cols.length > 7 ? "landscape" : "portrait"}; margin: 10mm } } table{border-collapse:collapse;width:100%;font-size:11px} th,td{border:1px solid #d1d5db;padding:4px 6px;text-align:left} th{background:#f3f4f6} td.n,th.n{text-align:right}`}</style>
      <div className="no-print" style={{ marginBottom: 16 }}><PrintButton /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: "2px solid #111", paddingBottom: 8, marginBottom: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {school?.logo_url && <img src={school.logo_url} alt="" style={{ height: 44 }} />}
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{school?.name ?? ""}{camp?.name ? ` · ${camp.name}` : ""}</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{r.name}</div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#4b5563", margin: "0 0 10px" }}>{CATEGORIES.find(([id]) => id === r.cat)?.[1]}{scope ? ` · ${scope}` : ""} · {rows.length} rows · printed {new Date().toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} by {me.full_name}</p>
      {error ? <p>{error}</p> : rows.length === 0 ? <p>No records for these filters.</p> : (
        <table>
          <thead><tr><th>#</th>{cols.map((c) => <th key={c.k} className={num(c.t) ? "n" : ""}>{c.l}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => <tr key={i}><td>{i + 1}</td>{cols.map((c) => <td key={c.k} className={num(c.t) ? "n" : ""}>{cell(c, row[c.k])}</td>)}</tr>)}
            {sum && <tr style={{ fontWeight: 800 }}><td />{sum.map((v, i) => <td key={i} className={i && num(cols[i].t) ? "n" : ""}>{v}</td>)}</tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
