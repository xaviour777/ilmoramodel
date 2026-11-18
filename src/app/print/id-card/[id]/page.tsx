import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../../paper-check/[id]/print-button";

// A student's ID card (credit-card size), for the family or the office.
export default async function IdCard({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("principal", "owner", "accountant", "teacher", "parent", "student");
  const { id } = await params;
  const supabase = await createClient();
  const { data: st } = await supabase.from("students").select("id, full_name, father_name, admission_no, photo_url, blood_group, sections(name, classes(name)), families(phone), campuses(name, city, schools(name, logo_url, primary_color))").eq("id", id).maybeSingle();
  if (!st) notFound();
  const sec = st.sections as unknown as { name: string; classes: { name: string } } | null;
  const camp = st.campuses as unknown as { name: string; city: string | null; schools: { name: string; logo_url: string | null; primary_color: string | null } } | null;
  const fam = st.families as unknown as { phone: string | null } | null;
  const color = camp?.schools.primary_color ?? "#16a34a";
  const qr = await QRCode.toDataURL(`${st.admission_no}|${st.full_name}`, { margin: 0, width: 120 });
  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: 24 }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>
      <div className="no-print mb-4 flex justify-center"><PrintButton /></div>
      <div style={{ width: "86mm", height: "54mm", margin: "0 auto", background: "#fff", borderRadius: "3mm", overflow: "hidden", border: "1px solid #ccc", fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>
        <div style={{ background: color, color: "#fff", padding: "2mm 3mm", display: "flex", alignItems: "center", gap: "2mm" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {camp?.schools.logo_url && <img src={camp.schools.logo_url} alt="" style={{ width: "7mm", height: "7mm", objectFit: "contain", background: "#fff", borderRadius: "1mm" }} />}
          <div><div style={{ fontWeight: 900, fontSize: "9pt" }}>{camp?.schools.name}</div><div style={{ fontSize: "6.5pt" }}>{camp?.name}{camp?.city ? `, ${camp.city}` : ""} · STUDENT CARD</div></div>
        </div>
        <div style={{ display: "flex", gap: "3mm", padding: "2.5mm 3mm", flex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {st.photo_url ? <img src={st.photo_url} alt="" style={{ width: "20mm", height: "26mm", objectFit: "cover", border: "1px solid #ccc" }} /> : <div style={{ width: "20mm", height: "26mm", border: "1px dashed #999", fontSize: "7pt", display: "flex", alignItems: "center", justifyContent: "center" }}>Photo</div>}
          <div style={{ flex: 1, fontSize: "7.5pt", lineHeight: 1.45 }}>
            <div style={{ fontWeight: 900, fontSize: "9.5pt" }}>{st.full_name}</div>
            <div>ID: <b>{st.admission_no}</b></div><div>Class: <b>{sec ? `${sec.classes.name}-${sec.name}` : ""}</b></div>
            <div>Father: {st.father_name ?? ""}</div>{st.blood_group && <div>Blood: {st.blood_group}</div>}{fam?.phone && <div>Emergency: {fam.phone}</div>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code" style={{ width: "15mm", height: "15mm", alignSelf: "flex-end" }} />
        </div>
      </div>
    </div>
  );
}
