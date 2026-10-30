import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { sectionReportCards } from "@/lib/report-card";
import { ReportCardSheet } from "@/components/report-card-sheet";
import { PrintButton } from "../../paper-check/[id]/print-button";

const PRINT_CSS = `@page { size: A4; margin: 0; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; break-after: page; } }`;

// One student's report card (the position is worked out against the whole section).
export default async function ReportCardPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("principal", "owner", "teacher");
  const { id } = await params;
  const supabase = await createClient();
  const { data: st } = await supabase.from("students").select("section_id, campuses(name, schools(name))").eq("id", id).maybeSingle();
  if (!st?.section_id) notFound();
  const r = await sectionReportCards(supabase, st.section_id);
  const card = r.cards.find((c) => c.student.id === id);
  if (!card) notFound();
  const campus = st.campuses as unknown as { name: string; schools: { name: string } };
  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "210mm" }}>
        <div className="text-sm">Only published results are on the card. Print on A4.</div>
        <PrintButton />
      </div>
      <ReportCardSheet c={card} school={campus?.schools?.name ?? ""} campus={campus?.name ?? me.campus_name} session={r.session} section={r.sectionLabel} classTeacher={r.classTeacher} />
    </div>
  );
}
