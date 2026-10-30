import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { rupees } from "@/lib/format";
import { PrintButton } from "../../paper-check/[id]/print-button";

const PRINT_CSS = `@page { size: A4; margin: 0; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; } }`;
const MODE: Record<string, string> = { cash: "Cash", jazzcash: "JazzCash", easypaisa: "Easypaisa" };

// A fee receipt: a school copy and a parent copy on the top half of an A4 page.
export default async function PrintReceipt({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("accountant", "principal", "owner");
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("payments")
    .select("id, family_id, amount_paisa, mode, reference, receipt_no, received_at, invoices(challan_no, billing_month), families(name, phone), profiles!payments_received_by_fkey(full_name)")
    .eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: campus }, { data: bal }, { data: kids }] = await Promise.all([
    supabase.from("campuses").select("name, schools(name)").eq("id", me.campus_id).maybeSingle(),
    supabase.from("family_balances").select("balance_paisa").eq("family_id", p.family_id).maybeSingle(),
    supabase.from("students").select("full_name, sections(name, classes(name))").eq("family_id", p.family_id).eq("status", "enrolled"),
  ]);
  const school = (campus?.schools as unknown as { name: string } | null)?.name ?? "";
  const fam = p.families as unknown as { name: string; phone: string | null } | null;
  const inv = p.invoices as unknown as { challan_no: string; billing_month: string } | null;
  const by = (p.profiles as unknown as { full_name: string } | null)?.full_name ?? "";
  const when = new Date(p.received_at);
  const balance = Number(bal?.balance_paisa ?? 0);
  const children = ((kids ?? []) as unknown as { full_name: string; sections: { name: string; classes: { name: string } } | null }[])
    .map((k) => `${k.full_name}${k.sections ? ` (${k.sections.classes.name}-${k.sections.name})` : ""}`).join(", ");
  const row = (label: string, value: string, bold = false) => (
    <tr><td style={{ padding: "1mm 0", width: "38%" }}>{label}</td><td style={{ padding: "1mm 0", fontWeight: bold ? 800 : 400 }}>{value}</td></tr>
  );

  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "210mm" }}>
        <div className="text-sm">Receipt {p.receipt_no ?? ""}</div>
        <PrintButton />
      </div>
      <div className="sheet mx-auto bg-white text-black shadow" style={{ width: "210mm", padding: "10mm", display: "flex", gap: "6mm", fontSize: "11px" }}>
        {["School copy", "Parent copy"].map((copy) => (
          <div key={copy} style={{ flex: 1, border: "1px solid #000", padding: "5mm", display: "flex", flexDirection: "column", gap: "2mm" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b style={{ fontSize: "14px" }}>{school}</b><i>{copy}</i>
            </div>
            <div>{campus?.name}</div>
            <div style={{ textAlign: "center", fontWeight: 800, fontSize: "13px", borderTop: "1px solid #000", borderBottom: "1px solid #000", padding: "1mm 0" }}>FEE RECEIPT</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {row("Receipt no", p.receipt_no ?? "", true)}
                {row("Date", when.toLocaleString("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }))}
                {row("Family", `${fam?.name ?? ""}${fam?.phone ? ` · ${fam.phone}` : ""}`)}
                {children && row("Children", children)}
                {inv && row("Challan", inv.challan_no)}
                {row("Amount received", rupees(Number(p.amount_paisa)), true)}
                {row("Paid by", `${MODE[p.mode] ?? p.mode}${p.reference ? ` · ${p.reference}` : ""}`)}
                {row(balance > 0 ? "Still due" : "Balance", balance > 0 ? rupees(balance) : "Nothing due")}
              </tbody>
            </table>
            <div style={{ marginTop: "8mm", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <span>Received by: {by}</span>
              <span style={{ borderTop: "1px solid #000", minWidth: "30mm", textAlign: "center" }}>Signature / stamp</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
