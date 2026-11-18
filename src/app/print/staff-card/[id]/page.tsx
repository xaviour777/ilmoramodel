import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../../paper-check/[id]/print-button";

const ROLE: Record<string, string> = { owner: "Owner", principal: "Principal", accountant: "Accounts", teacher: "Teacher" };

// A staff member's ID card (credit-card size).
export default async function StaffCard({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("principal", "owner");
  const { id } = await params;
  const sb = await createClient();
  const { data: p } = await sb.from("profiles").select("id, full_name, role, phone, employee_code, avatar_url, campuses(name, city, schools(name, logo_url, primary_color))").eq("id", id).maybeSingle();
  if (!p) notFound();
  const camp = p.campuses as unknown as { name: string; city: string | null; schools: { name: string; logo_url: string | null; primary_color: string | null } } | null;
  const color = camp?.schools.primary_color ?? "#16a34a";
  const qr = await QRCode.toDataURL(`${p.employee_code ?? p.id}|${p.full_name}`, { margin: 0, width: 120 });
  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: 24 }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>
      <div className="no-print mb-4 flex justify-center"><PrintButton /></div>
      <div style={{ width: "86mm", height: "54mm", margin: "0 auto", background: "#fff", borderRadius: "3mm", overflow: "hidden", border: "1px solid #ccc", fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>
        <div style={{ background: color, color: "#fff", padding: "2mm 3mm" }}>
          <div style={{ fontWeight: 900, fontSize: "9pt" }}>{camp?.schools.name}</div><div style={{ fontSize: "6.5pt" }}>{camp?.name}{camp?.city ? `, ${camp.city}` : ""} · STAFF CARD</div>
        </div>
        <div style={{ display: "flex", gap: "3mm", padding: "2.5mm 3mm", flex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: "20mm", height: "25mm", objectFit: "cover", borderRadius: "1.5mm" }} /> : <div style={{ width: "20mm", height: "25mm", background: "#eee", borderRadius: "1.5mm" }} />}
          <div style={{ flex: 1, fontSize: "7.5pt", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 900, fontSize: "10pt" }}>{p.full_name}</div>
            <div>{ROLE[p.role] ?? p.role}</div>
            <div>ID: <b>{p.employee_code ?? "—"}</b></div>
            {p.phone && <div>Phone: {p.phone}</div>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="" style={{ width: "16mm", height: "16mm", alignSelf: "flex-end" }} />
        </div>
      </div>
    </div>
  );
}
