import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { rupees, shortDate } from "@/lib/format";
import { PAY_MODE } from "@/lib/payroll";
import { PrintButton } from "../../paper-check/[id]/print-button";

const PRINT_CSS = `@page { size: A4; margin: 0; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; } }`;

// One payslip, office copy and employee copy. Staff can open their own.
export default async function Payslip({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("principal", "owner", "accountant", "teacher");
  const { id } = await params;
  const supabase = await createClient();
  const { data: r } = await supabase.from("salary_payments").select("*, profiles!salary_payments_profile_id_fkey(full_name, role)").eq("id", id).maybeSingle();
  if (!r) notFound();
  const [{ data: campus }, { data: d }] = await Promise.all([
    supabase.from("campuses").select("name, schools(name)").eq("id", me.campus_id).maybeSingle(),
    supabase.from("staff_details").select("designation, cnic, bank_name, account_no").eq("profile_id", r.profile_id).maybeSingle(),
  ]);
  const school = (campus?.schools as unknown as { name: string } | null)?.name ?? "";
  const who = r.profiles as unknown as { full_name: string; role: string } | null;
  const monthName = new Date(r.month + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const earn: [string, number][] = [["Basic salary", r.basic_paisa], ["Allowances", r.allowance_paisa], ["Bonus", r.bonus_paisa]];
  const cut: [string, number][] = [[`Absent days (${r.absent_days})`, r.absence_cut_paisa], ["Advance taken back", r.advance_cut_paisa], ["Other", r.other_cut_paisa]];
  const td = { padding: "1mm 0" } as const;

  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "210mm" }}>
        <div className="text-sm">Payslip · {who?.full_name} · {monthName}</div>
        <PrintButton />
      </div>
      <div className="sheet mx-auto bg-white text-black shadow" style={{ width: "210mm", padding: "10mm", display: "flex", flexDirection: "column", gap: "8mm", fontSize: "11px" }}>
        {["Office copy", "Employee copy"].map((copy) => (
          <div key={copy} style={{ border: "1px solid #000", padding: "5mm", display: "flex", flexDirection: "column", gap: "2mm" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ fontSize: "14px" }}>{school} · {campus?.name}</b><i>{copy}</i></div>
            <div style={{ textAlign: "center", fontWeight: 800, fontSize: "13px", borderTop: "1px solid #000", borderBottom: "1px solid #000", padding: "1mm 0" }}>PAYSLIP · {monthName.toUpperCase()}</div>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "2mm" }}>
              <span>Name: <b>{who?.full_name}</b></span><span>{d?.designation ?? who?.role}</span>{d?.cnic && <span>CNIC {d.cnic}</span>}
            </div>
            <div style={{ display: "flex", gap: "6mm" }}>
              {[["Earnings", earn], ["Deductions", cut]].map(([title, list]) => (
                <table key={title as string} style={{ flex: 1, borderCollapse: "collapse" }}>
                  <thead><tr><th style={{ ...td, textAlign: "left", borderBottom: "1px solid #000" }}>{title as string}</th><th style={{ ...td, borderBottom: "1px solid #000" }} /></tr></thead>
                  <tbody>{(list as [string, number][]).map(([l, v]) => <tr key={l}><td style={td}>{l}</td><td style={{ ...td, textAlign: "right" }}>{rupees(Number(v))}</td></tr>)}</tbody>
                </table>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #000", paddingTop: "1mm", fontSize: "13px" }}><b>Net pay</b><b>{rupees(Number(r.net_paisa))}</b></div>
            <div>{r.status === "paid" ? `Paid ${r.paid_on ? shortDate(r.paid_on) : ""} by ${PAY_MODE[r.pay_mode ?? "cash"]}${r.reference ? ` · ${r.reference}` : ""}${r.pay_mode === "bank" && d?.account_no ? ` to ${d.bank_name ?? ""} ${d.account_no}` : ""}` : "Not paid yet"}{r.note ? ` · ${r.note}` : ""}</div>
            <div style={{ marginTop: "8mm", display: "flex", justifyContent: "space-between" }}>
              <span style={{ borderTop: "1px solid #000", minWidth: "40mm", textAlign: "center" }}>Accounts</span>
              <span style={{ borderTop: "1px solid #000", minWidth: "40mm", textAlign: "center" }}>Received by</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
