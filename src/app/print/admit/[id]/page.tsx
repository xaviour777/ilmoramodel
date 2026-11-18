import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate, time } from "@/lib/format";
import { PrintButton } from "../../paper-check/[id]/print-button";

// One student's admit card for one exam, for the family or the office.
export default async function AdmitCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ exam?: string }> }) {
  const me = await requireRole("principal", "owner", "accountant", "teacher", "parent", "student");
  const { id } = await params;
  const { exam } = await searchParams;
  const supabase = await createClient();
  const { data: st } = await supabase.from("students").select("id, full_name, father_name, roll_no, admission_no, photo_url, family_id, section_id, sections(name, class_id, classes(name)), campuses(name, schools(name, logo_url))").eq("id", id).maybeSingle();
  if (!st) notFound();
  const sec = st.sections as unknown as { name: string; class_id: string; classes: { name: string } } | null;
  const [{ data: ex }, { data: papers }, { data: bal }, { data: principal }] = await Promise.all([
    supabase.from("exams").select("id, name").eq("id", exam ?? "").maybeSingle(),
    supabase.from("exam_papers").select("paper_date, starts_at, ends_at, subjects(name)").eq("exam_id", exam ?? "").eq("class_id", sec?.class_id ?? "").order("paper_date").order("starts_at"),
    st.family_id ? supabase.from("family_balances").select("balance_paisa").eq("family_id", st.family_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("profiles").select("full_name").eq("role", "principal").eq("is_active", true).limit(1).maybeSingle(),
  ]);
  if (!ex) notFound();
  const campus = st.campuses as unknown as { name: string; schools: { name: string; logo_url: string | null } } | null;
  const owes = Number(bal?.balance_paisa ?? 0) > 0;
  const family = me.role === "parent" || me.role === "student";
  if (family && owes) return (
    <div style={{ maxWidth: 520, margin: "60px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>Admit card is held</h1>
      <p>There are unpaid fees on your account, so the school holds the admit card. Please pay the fees (Fees in the app) or speak to the office, and the card will open here.</p>
    </div>
  );
  const cell = { border: "1px solid #000", padding: "1.5mm 2mm" } as const;
  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }}>
      <style>{`@page { size: A5; margin: 8mm; } @media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-end px-2" style={{ maxWidth: "148mm" }}><PrintButton /></div>
      <div className="mx-auto bg-white text-black" style={{ width: "148mm", padding: "8mm", fontSize: "10pt", border: "2px solid #000" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "3mm", borderBottom: "1.5px solid #000", paddingBottom: "2mm" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {campus?.schools.logo_url && <img src={campus.schools.logo_url} alt="" style={{ width: "12mm", height: "12mm", objectFit: "contain" }} />}
          <div><div style={{ fontWeight: 900, fontSize: "14pt" }}>{campus?.schools.name}</div><div>{campus?.name} · {ex.name}</div></div>
        </div>
        <div style={{ textAlign: "center", fontWeight: 900, letterSpacing: ".15em", margin: "3mm 0" }}>ADMIT CARD</div>
        <div style={{ display: "flex", gap: "4mm" }}>
          <div style={{ flex: 1, lineHeight: 1.7 }}>
            <div>Name: <b>{st.full_name}</b></div><div>Father: <b>{st.father_name ?? ""}</b></div>
            <div>Class: <b>{sec ? `${sec.classes.name}-${sec.name}` : ""}</b> · Roll: <b>{st.roll_no ?? ""}</b></div><div>Student ID: <b>{st.admission_no}</b></div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {st.photo_url ? <img src={st.photo_url} alt="" style={{ width: "24mm", height: "32mm", objectFit: "cover", border: "1px solid #000" }} /> : <div style={{ width: "24mm", height: "32mm", border: "1px dashed #000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8pt" }}>Photo</div>}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "3mm" }}>
          <thead><tr><th style={cell}>Date</th><th style={cell}>Paper</th><th style={cell}>Time</th></tr></thead>
          <tbody>{((papers ?? []) as unknown as { paper_date: string; starts_at: string | null; ends_at: string | null; subjects: { name: string } }[]).map((p, i) => (
            <tr key={i}><td style={cell}>{shortDate(p.paper_date)}</td><td style={cell}>{p.subjects.name}</td><td style={cell}>{time(p.starts_at)}{p.ends_at ? `–${time(p.ends_at)}` : ""}</td></tr>
          ))}</tbody>
        </table>
        {(papers ?? []).length === 0 && <p>The date sheet for this class isn&apos;t out yet.</p>}
        <div style={{ marginTop: "8mm", display: "flex", justifyContent: "space-between" }}><span>Student&apos;s signature</span><span>{principal?.full_name ?? "Principal"}</span></div>
      </div>
    </div>
  );
}
