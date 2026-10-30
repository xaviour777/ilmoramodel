import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { sectionReportCards } from "@/lib/report-card";
import { ReportCardSheet } from "@/components/report-card-sheet";
import { PrintButton } from "../paper-check/[id]/print-button";

const PRINT_CSS = `@page { size: A4; margin: 0; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; break-after: page; } }`;

// Every report card of one section, ready to print in one go.
export default async function SectionReportCards({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const me = await requireRole("principal", "owner", "teacher");
  const { section } = await searchParams;
  const supabase = await createClient();
  const { data: campus } = await supabase.from("campuses").select("name, schools(name)").eq("id", me.campus_id).maybeSingle();
  const r = section ? await sectionReportCards(supabase, section) : null;
  const school = (campus?.schools as unknown as { name: string } | null)?.name ?? "";
  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "210mm" }}>
        <div className="text-sm">{r ? `${r.cards.length} report cards for ${r.sectionLabel}. Only published results are on the cards.` : "Choose a section from the Exams page."}</div>
        {r && <PrintButton />}
      </div>
      {r?.cards.map((c) => (
        <ReportCardSheet key={c.student.id} c={c} school={school} campus={campus?.name ?? ""} session={r.session} section={r.sectionLabel} classTeacher={r.classTeacher} />
      ))}
    </div>
  );
}
