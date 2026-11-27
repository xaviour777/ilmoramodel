import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { time } from "@/lib/format";
import { dayLabel } from "@/lib/exam-flow";
import { PrintButton } from "../paper-check/[id]/print-button";

const PRINT_CSS = `@page { size: A4 landscape; margin: 10mm; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; } }`;

// The date sheet for the notice board: dates down the side, classes across.
export default async function DateSheetPrint({ searchParams }: { searchParams: Promise<{ exam?: string }> }) {
  const me = await requireRole("principal", "owner", "accountant", "teacher");
  const { exam: id } = await searchParams;
  const supabase = await createClient();
  const [{ data: exam }, { data: papers }, { data: campus }] = await Promise.all([
    supabase.from("exams").select("name").eq("id", id ?? "").maybeSingle(),
    supabase.from("exam_papers").select("class_id, paper_date, starts_at, ends_at, classes(name, sort), subjects(name)").eq("exam_id", id ?? "").order("paper_date"),
    supabase.from("campuses").select("name, schools(name, logo_url)").eq("id", me.campus_id).maybeSingle(),
  ]);
  if (!exam) return <p style={{ padding: 24 }}>Choose an exam from Exams first.</p>;
  type P = { class_id: string; paper_date: string; starts_at: string | null; ends_at: string | null; classes: { name: string; sort: number }; subjects: { name: string } };
  const list = (papers ?? []) as unknown as P[];
  const school = campus?.schools as unknown as { name: string; logo_url: string | null } | null;
  const classes = [...new Map(list.map((p) => [p.class_id, p.classes])).entries()].sort((a, b) => a[1].sort - b[1].sort);
  const dates = [...new Set(list.map((p) => p.paper_date))].sort();
  const at = new Map(list.map((p) => [`${p.paper_date}|${p.class_id}`, p]));
  const times = [...new Set(list.filter((p) => p.starts_at).map((p) => `${time(p.starts_at)}–${time(p.ends_at)}`))];
  const cell = { border: "1px solid #000", padding: "2.5mm 2mm", textAlign: "center" as const };

  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "297mm" }}>
        <div className="text-sm">Date sheet. A4 landscape.</div>
        <PrintButton />
      </div>
      <div className="sheet mx-auto bg-white text-black shadow" style={{ width: "297mm", minHeight: "190mm", padding: "10mm 12mm", fontSize: "11pt" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4mm", borderBottom: "2px solid #000", paddingBottom: "3mm", marginBottom: "4mm" }}>
          {school?.logo_url && <img src={school.logo_url} alt="" style={{ height: "16mm" }} />}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "17pt", fontWeight: 800 }}>{school?.name ?? ""}</div>
            <div style={{ fontWeight: 700 }}>{campus?.name}</div>
            <div style={{ fontSize: "14pt", fontWeight: 800, marginTop: "1mm" }}>Date Sheet · {exam.name}</div>
          </div>
        </div>
        {!list.length ? <p>No papers on the date sheet yet.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><th style={{ ...cell, background: "#f1f5f9" }}>Date</th>{classes.map(([cid, c]) => <th key={cid} style={{ ...cell, background: "#f1f5f9" }}>{c.name}</th>)}</tr>
            </thead>
            <tbody>
              {dates.map((d) => (
                <tr key={d}>
                  <td style={{ ...cell, fontWeight: 800, whiteSpace: "nowrap" }}>{dayLabel(d)}</td>
                  {classes.map(([cid]) => <td key={cid} style={cell}>{at.get(`${d}|${cid}`)?.subjects.name ?? "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6mm", fontSize: "10pt" }}>
          <span>{times.length === 1 ? `Time: ${times[0]}` : ""} · Students must reach 15 minutes early with their admit card.</span>
          <span>Principal: ____________________</span>
        </div>
      </div>
    </div>
  );
}
