import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { rupees, shortDate, todayPK } from "@/lib/format";
import { PrintButton } from "../../paper-check/[id]/print-button";

const TITLE: Record<string, string> = { character: "Character Certificate", leaving: "School Leaving Certificate", fee: "Fee Clearance Certificate", bonafide: "Bonafide Student Certificate" };

// Certificates the office prints and signs: character, school leaving, fee clearance.
export default async function Certificate({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string; cert?: string }> }) {
  await requireRole("principal", "owner", "accountant");
  const { id } = await params;
  const q = await searchParams;
  const sb = await createClient();
  // an issued certificate keeps its serial number, date and the class as it was on that day
  const { data: cert } = q.cert ? await sb.from("student_certificates").select("kind, serial_no, issued_on, snapshot").eq("id", q.cert).eq("student_id", id).maybeSingle() : { data: null };
  const type = cert?.kind ?? q.type ?? "character";
  if (!TITLE[type]) notFound();
  const { data: s } = await sb.from("students").select("id, full_name, father_name, admission_no, date_of_birth, admitted_on, left_on, status, family_id, sections(name, classes(name)), campuses(name, city, schools(name, logo_url, primary_color))").eq("id", id).maybeSingle();
  if (!s) notFound();
  const sec = s.sections as unknown as { name: string; classes: { name: string } } | null;
  const camp = s.campuses as unknown as { name: string; city: string | null; schools: { name: string; logo_url: string | null; primary_color: string | null } } | null;
  const { data: bal } = s.family_id ? await sb.from("family_balances").select("balance_paisa").eq("family_id", s.family_id).maybeSingle() : { data: null };
  const owed = Number(bal?.balance_paisa ?? 0);
  const today = cert?.issued_on ?? todayPK();
  const snap = (cert?.snapshot ?? null) as { class?: string | null; section?: string | null } | null;
  const studying = s.status === "enrolled";
  const until = s.left_on ?? today;
  const color = camp?.schools.primary_color ?? "#16a34a";
  const qr = await QRCode.toDataURL(`${TITLE[type]}|${cert?.serial_no ?? ""}|${s.admission_no}|${s.full_name}|${today}`, { margin: 0, width: 110 });
  const cls = snap?.class ? `${snap.class} ${snap.section ?? ""}`.trim() : sec ? `${sec.classes.name} ${sec.name}` : "—";
  const who = `${s.full_name}${s.father_name ? `, child of ${s.father_name},` : ""} (admission no. ${s.admission_no ?? "—"})`;
  const text = type === "character"
    ? `This is to certify that ${who} ${studying ? `has been a student of this school since ${shortDate(s.admitted_on)} and is presently in class ${cls}` : `was a student of this school from ${shortDate(s.admitted_on)} to ${shortDate(until)}, last in class ${cls}`}. To the best of our knowledge, the student bears a good moral character and has not taken part in any activity against the discipline of the school.`
    : type === "bonafide"
    ? `This is to certify that ${who} is a bonafide student of this school, studying in class ${cls} since ${shortDate(s.admitted_on)}.${s.date_of_birth ? ` Date of birth as per school record: ${shortDate(s.date_of_birth)}.` : ""} This certificate is issued on request for whatever purpose it may serve.`
    : type === "leaving"
    ? `This is to certify that ${who} was a student of this school from ${shortDate(s.admitted_on)} to ${shortDate(until)}, and was studying in class ${cls} at the time of leaving.${s.date_of_birth ? ` Date of birth as per school record: ${shortDate(s.date_of_birth)}.` : ""} ${owed > 0 ? `Dues outstanding: ${rupees(owed)}.` : "All dues have been cleared."} We wish the student success.`
    : owed > 0 ? `The family of ${who} still owes ${rupees(owed)} to the school. A fee clearance certificate can be issued once this is paid.` : `This is to certify that ${who}, class ${cls}, has paid all fees due to the school up to ${shortDate(today)}. Nothing is outstanding.`;
  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: 24 }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } @page { size: A4; margin: 0 } }`}</style>
      <div className="no-print mb-4 flex justify-center"><PrintButton /></div>
      <div style={{ width: "210mm", minHeight: "297mm", margin: "0 auto", background: "#fff", padding: "18mm", fontFamily: "Georgia, serif", boxSizing: "border-box" }}>
        <div style={{ border: `3px double ${color}`, padding: "14mm", minHeight: "255mm", display: "flex", flexDirection: "column" }}>
          <div style={{ textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {camp?.schools.logo_url && <img src={camp.schools.logo_url} alt="" style={{ height: "22mm", margin: "0 auto" }} />}
            <div style={{ fontSize: "22pt", fontWeight: 900, color }}>{camp?.schools.name}</div>
            <div style={{ fontSize: "11pt" }}>{camp?.name}{camp?.city ? `, ${camp.city}` : ""}</div>
            <div style={{ fontSize: "18pt", fontWeight: 700, marginTop: "12mm", textDecoration: "underline" }}>{TITLE[type]}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10pt", marginTop: "10mm" }}><span>No. {cert?.serial_no ?? `${type.slice(0, 2).toUpperCase()}-${s.admission_no ?? s.id.slice(0, 6)}`}</span><span>Date: {shortDate(today)}</span></div>
          <p style={{ fontSize: "13pt", lineHeight: 2, marginTop: "12mm", textAlign: "justify" }}>{text}</p>
          <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="" style={{ width: "24mm" }} />
            <div style={{ textAlign: "center", fontSize: "11pt" }}><div style={{ borderTop: "1px solid #000", width: "60mm", paddingTop: 4 }}>Principal · signature & stamp</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
