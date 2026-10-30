import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/format";
import { BOARD_COLS, BOARD_GROUPS, boardMissing, type BoardStudent } from "@/lib/board-form";
import { PrintButton } from "../paper-check/[id]/print-button";

const PRINT_CSS = `@page { size: A4 landscape; margin: 8mm; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; } }`;
type Row = BoardStudent & { id: string; roll_no: string | null; admission_no: string | null; mother_name: string | null; hafiz_quran: boolean; disability: string | null; families: { phone: string | null } | null };

// One section's students with every board registration field, and what is still missing, to check before the board's portal.
export default async function BoardList({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  await requireRole("principal", "owner", "accountant");
  const { section } = await searchParams;
  const supabase = await createClient();
  const [{ data: sec }, { data }] = await Promise.all([
    supabase.from("sections").select("name, classes(name)").eq("id", section ?? "").maybeSingle(),
    supabase.from("students").select(BOARD_COLS).eq("section_id", section ?? "").eq("status", "enrolled").order("roll_no").order("full_name"),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const label = sec ? `${(sec.classes as unknown as { name: string }).name}-${sec.name}` : "";
  const ready = rows.filter((r) => boardMissing(r, r.families?.phone ?? null).length === 0).length;
  const td = { border: "1px solid #999", padding: "1mm", verticalAlign: "top" } as const;

  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex flex-wrap items-center justify-between gap-3 px-2" style={{ maxWidth: "290mm" }}>
        <div className="text-sm">{label ? `${label}: ${ready} of ${rows.length} ready for the board form.` : "Choose a class on the Students page."}</div>
        <div className="flex gap-2">
          {label && <a className="btn-ghost min-h-10 px-3 text-sm" href={`/principal/students/board-list.csv?section=${section}`}>Download Excel (CSV)</a>}
          {label && <PrintButton />}
        </div>
      </div>
      {label && (
        <div className="sheet mx-auto bg-white text-black shadow" style={{ width: "290mm", padding: "6mm", fontSize: "9px" }}>
          <h1 style={{ fontSize: "14px", fontWeight: 800, marginBottom: "2mm" }}>Board registration list · {label}</h1>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Roll", "Photo", "Name", "Father", "Father CNIC", "B-form", "Born", "Gender", "Religion", "Group", "Mobile", "Address", "Missing"].map((h) => <th key={h} style={{ ...td, background: "#eee", textAlign: "left" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const miss = boardMissing(r, r.families?.phone ?? null);
                return (
                  <tr key={r.id}>
                    <td style={td}>{r.roll_no}</td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <td style={td}>{r.photo_url ? <img src={r.photo_url} alt="" style={{ width: "12mm", height: "16mm", objectFit: "cover" }} /> : "–"}</td>
                    <td style={td}>{r.full_name}{r.hafiz_quran ? " (Hafiz)" : ""}</td>
                    <td style={td}>{r.father_name}</td>
                    <td style={td}>{r.father_cnic}</td>
                    <td style={td}>{r.b_form}</td>
                    <td style={td}>{r.date_of_birth ? shortDate(r.date_of_birth) : ""}</td>
                    <td style={td}>{r.gender === "male" ? "Male" : r.gender === "female" ? "Female" : ""}</td>
                    <td style={td}>{r.religion}</td>
                    <td style={td}>{r.board_group ? BOARD_GROUPS[r.board_group] : ""}</td>
                    <td style={td}>{r.families?.phone}</td>
                    <td style={td}>{r.address}</td>
                    <td style={{ ...td, color: miss.length ? "#b00" : "#070", fontWeight: 700 }}>{miss.length ? miss.join(", ") : "Ready"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
