import QRCode from "qrcode";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { BADGE_PREFIX } from "@/lib/badge";
import { PrintButton } from "../paper-check/[id]/print-button";

const PRINT_CSS = `@page { size: A4; margin: 8mm; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; } }`;
const ROLE: Record<string, string> = { owner: "Owner", principal: "Principal", accountant: "Accounts", teacher: "Teacher" };

// Staff ID cards with the gate QR, 8 to an A4 page (card size 85 x 54 mm, cut and laminate).
export default async function StaffCards({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const me = await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("staff_badges").select("token, profiles!inner(id, full_name, role, phone, avatar_url, is_active)").eq("profiles.is_active", true);
  if (sp.id) q = q.eq("profile_id", sp.id);
  const [{ data: badges }, { data: campus }] = await Promise.all([
    q,
    supabase.from("campuses").select("name, schools(name)").eq("id", me.campus_id).maybeSingle(),
  ]);
  type B = { token: string; profiles: { id: string; full_name: string; role: string; phone: string | null; avatar_url: string | null } };
  const list = ((badges ?? []) as unknown as B[]).sort((a, b) => a.profiles.full_name.localeCompare(b.profiles.full_name));
  const school = (campus?.schools as unknown as { name: string } | null)?.name ?? "";
  const qrs = await Promise.all(list.map((b) => QRCode.toString(BADGE_PREFIX + b.token, { type: "svg", margin: 0, errorCorrectionLevel: "M" })));

  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "194mm" }}>
        <div className="text-sm">{list.length} staff card{list.length === 1 ? "" : "s"}. Print, cut and laminate. A lost card: print that person again from their staff page.</div>
        <PrintButton />
      </div>
      <div className="sheet mx-auto bg-white shadow" style={{ width: "194mm", display: "grid", gridTemplateColumns: "85mm 85mm", gap: "6mm 8mm", justifyContent: "center", padding: "6mm 0" }}>
        {list.map((b, i) => (
          <div key={b.token} style={{ width: "85mm", height: "54mm", border: "1px solid #103d37", borderRadius: "3mm", overflow: "hidden", display: "flex", flexDirection: "column", breakInside: "avoid", color: "#002622", fontFamily: "Manrope, sans-serif" }}>
            <div style={{ background: "#103d37", color: "#fff", padding: "2mm 3mm", fontSize: "9pt", fontWeight: 800, display: "flex", justifyContent: "space-between" }}>
              <span>{school}</span><span style={{ fontWeight: 500, fontSize: "7pt" }}>{campus?.name}</span>
            </div>
            <div style={{ flex: 1, display: "flex", gap: "3mm", padding: "3mm", alignItems: "center" }}>
              {b.profiles.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={b.profiles.avatar_url} alt="" style={{ width: "20mm", height: "25mm", objectFit: "cover", borderRadius: "1.5mm" }} />
                : <div style={{ width: "20mm", height: "25mm", borderRadius: "1.5mm", background: "#e1f8f3", display: "grid", placeItems: "center", fontSize: "16pt", fontWeight: 800 }}>{b.profiles.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "11pt", fontWeight: 800, lineHeight: 1.2 }}>{b.profiles.full_name}</div>
                <div style={{ fontSize: "8pt", marginTop: "1mm" }}>{ROLE[b.profiles.role] ?? b.profiles.role}</div>
                {b.profiles.phone && <div style={{ fontSize: "8pt" }}>{b.profiles.phone}</div>}
                <div style={{ fontSize: "6.5pt", marginTop: "2mm", color: "#404946" }}>Show this QR at the gate to check in and out.</div>
              </div>
              <div style={{ width: "24mm", textAlign: "center" }}>
                <div style={{ width: "24mm", height: "24mm" }} dangerouslySetInnerHTML={{ __html: qrs[i] }} />
                <div style={{ fontSize: "5pt", marginTop: "0.5mm", wordBreak: "break-all", color: "#404946" }}>{b.token}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
