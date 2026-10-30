import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { allRows } from "@/lib/outbox";
import { rupees, shortDate } from "@/lib/format";
import { PrintButton } from "../paper-check/[id]/print-button";

// a whole month of challans for a big school is a lot of rows
export const maxDuration = 60;

const PRINT_CSS = `@page { size: A4; margin: 0; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; break-after: page; } }`;
const COPIES = ["Bank / wallet copy", "School copy", "Parent copy"];

type Inv = { id: string; family_id: string; challan_no: string; due_on: string; billing_month: string };
type Line = { invoice_id: string; description: string; amount_paisa: number; students: { full_name: string } | null };

// Three copies of each family's challan on one A4 page: one for the payment, one for the school, one for the parent.
export default async function PrintChallans({ searchParams }: { searchParams: Promise<{ month?: string; family?: string }> }) {
  const me = await requireRole("accountant", "principal", "owner");
  const { month, family } = await searchParams;
  const supabase = await createClient();
  const ok = /^\d{4}-\d{2}$/.test(month ?? "");
  const { data: campus } = await supabase.from("campuses").select("name, schools(name)").eq("id", me.campus_id).maybeSingle();
  const school = (campus?.schools as unknown as { name: string } | null)?.name ?? "";

  let invoices: Inv[] = [];
  if (ok) {
    invoices = await allRows<Inv>((a, b) => {
      let q = supabase.from("invoices").select("id, family_id, challan_no, due_on, billing_month").eq("billing_month", `${month}-01`);
      if (family) q = q.eq("family_id", family);
      return q.order("challan_no").order("id").range(a, b);
    });
  }
  const famIds = [...new Set(invoices.map((i) => i.family_id))];
  const invIds = invoices.map((i) => i.id);
  const fams = new Map<string, { name: string; phone: string | null }>();
  const balance = new Map<string, number>();
  const lines = new Map<string, Line[]>();
  // .in() lists go in the URL, so ask in slices
  for (let i = 0; i < famIds.length; i += 150) {
    const ids = famIds.slice(i, i + 150);
    const [{ data: f }, { data: b }] = await Promise.all([
      supabase.from("families").select("id, name, phone").in("id", ids),
      supabase.from("family_balances").select("family_id, balance_paisa").in("family_id", ids),
    ]);
    for (const x of f ?? []) fams.set(x.id, x);
    for (const x of b ?? []) balance.set(x.family_id, Number(x.balance_paisa));
  }
  for (let i = 0; i < invIds.length; i += 150) {
    const ids = invIds.slice(i, i + 150);
    const rows = await allRows<Line>((a, b) =>
      supabase.from("invoice_lines").select("invoice_id, description, amount_paisa, students(full_name)").in("invoice_id", ids).order("id").range(a, b) as never);
    for (const l of rows) lines.set(l.invoice_id, [...(lines.get(l.invoice_id) ?? []), l]);
  }
  const monthName = ok ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : "";

  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "210mm" }}>
        <div className="text-sm">{ok ? `${invoices.length} challans for ${monthName}.` : "Choose a month from Fees and challans."}</div>
        {invoices.length > 0 && <PrintButton />}
      </div>
      {invoices.map((inv) => {
        const fam = fams.get(inv.family_id);
        const ls = lines.get(inv.id) ?? [];
        const thisMonth = ls.reduce((t, l) => t + Number(l.amount_paisa), 0);
        const total = balance.get(inv.family_id) ?? thisMonth;
        const earlier = total - thisMonth;
        return (
          <div key={inv.id} className="sheet mx-auto bg-white text-black shadow" style={{ width: "210mm", minHeight: "297mm", padding: "8mm", display: "flex", flexDirection: "column", gap: "4mm", fontSize: "10.5px" }}>
            {COPIES.map((copy) => (
              <div key={copy} style={{ border: "1px solid #000", padding: "4mm", flex: 1, display: "flex", flexDirection: "column", gap: "2mm" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div><b style={{ fontSize: "14px" }}>{school}</b> · {campus?.name}</div>
                  <i>{copy}</i>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "2mm" }}>
                  <span>Challan <b>{inv.challan_no}</b></span>
                  <span>Fee for <b>{monthName}</b></span>
                  <span>Last date <b>{shortDate(inv.due_on)}</b></span>
                </div>
                <div>Family: <b>{fam?.name}</b>{fam?.phone ? ` · ${fam.phone}` : ""}</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {ls.map((l, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #ccc" }}>
                        <td style={{ padding: "0.6mm 0" }}>{l.students?.full_name ? `${l.students.full_name}: ` : ""}{l.description}</td>
                        <td style={{ textAlign: "right" }}>{rupees(Number(l.amount_paisa))}</td>
                      </tr>
                    ))}
                    <tr><td style={{ padding: "0.6mm 0" }}>This month</td><td style={{ textAlign: "right" }}>{rupees(thisMonth)}</td></tr>
                    {earlier !== 0 && <tr><td style={{ padding: "0.6mm 0" }}>{earlier > 0 ? "Earlier dues" : "Paid in advance"}</td><td style={{ textAlign: "right" }}>{rupees(earlier)}</td></tr>}
                    <tr style={{ borderTop: "2px solid #000" }}><td style={{ padding: "1mm 0" }}><b>Total to pay</b></td><td style={{ textAlign: "right" }}><b>{rupees(Math.max(total, 0))}</b></td></tr>
                  </tbody>
                </table>
                <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <span>Pay by Cash at the school office, JazzCash or Easypaisa. Write the challan number with a wallet payment.</span>
                  <span style={{ borderTop: "1px solid #000", minWidth: "35mm", textAlign: "center" }}>Received by</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
