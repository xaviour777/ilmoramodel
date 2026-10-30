import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { rupees } from "@/lib/format";
import { PAY_MODE } from "@/lib/payroll";
import { PrintButton } from "../../paper-check/[id]/print-button";

const PRINT_CSS = `@page { size: A4 landscape; margin: 8mm; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; } }`;

// The whole month's salary sheet with bank details, for the owner's signature or the bank.
export default async function SalarySheet({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireRole("principal", "owner", "accountant");
  const { month } = await searchParams;
  const supabase = await createClient();
  const m = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : "";
  const [{ data }, { data: details }, { data: campus }] = await Promise.all([
    supabase.from("salary_payments").select("*, profiles!salary_payments_profile_id_fkey(full_name)").eq("month", `${m || "1900-01"}-01`),
    supabase.from("staff_details").select("profile_id, designation, bank_name, account_no, wallet_no"),
    supabase.from("campuses").select("name, schools(name)").eq("id", me.campus_id).maybeSingle(),
  ]);
  type R = { id: string; profile_id: string; basic_paisa: number; allowance_paisa: number; bonus_paisa: number; absence_cut_paisa: number; advance_cut_paisa: number; other_cut_paisa: number; net_paisa: number; status: string; pay_mode: string | null; profiles: { full_name: string } | null };
  const rows = ((data ?? []) as unknown as R[]).sort((a, b) => (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? ""));
  const det = new Map((details ?? []).map((d) => [d.profile_id, d]));
  const sum = (k: keyof R) => rows.reduce((t, r) => t + Number(r[k]), 0);
  const school = (campus?.schools as unknown as { name: string } | null)?.name ?? "";
  const monthName = m ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
  const td = { border: "1px solid #999", padding: "1mm 1.5mm" } as const;
  const num = { ...td, textAlign: "right" as const };

  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "290mm" }}>
        <div className="text-sm">{rows.length} salaries · {monthName}</div>
        {rows.length > 0 && <PrintButton />}
      </div>
      <div className="sheet mx-auto bg-white text-black shadow" style={{ width: "290mm", padding: "6mm", fontSize: "10px" }}>
        <h1 style={{ fontSize: "14px", fontWeight: 800 }}>{school} · {campus?.name} · Salary sheet {monthName}</h1>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "2mm" }}>
          <thead><tr>{["#", "Name", "Post", "Basic", "Allowances", "Bonus", "Absent cut", "Advance cut", "Other cut", "Net", "Paid by", "Account", "Status", "Signature"].map((h) => <th key={h} style={{ ...td, background: "#eee", textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const d = det.get(r.profile_id);
              return (
                <tr key={r.id}>
                  <td style={td}>{i + 1}</td><td style={td}>{r.profiles?.full_name}</td><td style={td}>{d?.designation}</td>
                  <td style={num}>{rupees(Number(r.basic_paisa))}</td><td style={num}>{rupees(Number(r.allowance_paisa))}</td><td style={num}>{rupees(Number(r.bonus_paisa))}</td>
                  <td style={num}>{rupees(Number(r.absence_cut_paisa))}</td><td style={num}>{rupees(Number(r.advance_cut_paisa))}</td><td style={num}>{rupees(Number(r.other_cut_paisa))}</td>
                  <td style={{ ...num, fontWeight: 800 }}>{rupees(Number(r.net_paisa))}</td>
                  <td style={td}>{PAY_MODE[r.pay_mode ?? "cash"]}</td>
                  <td style={td}>{r.pay_mode === "bank" ? `${d?.bank_name ?? ""} ${d?.account_no ?? ""}` : r.pay_mode === "cash" ? "" : d?.wallet_no}</td>
                  <td style={td}>{r.status === "paid" ? "Paid" : "Due"}</td><td style={{ ...td, width: "22mm" }} />
                </tr>
              );
            })}
            <tr style={{ fontWeight: 800 }}>
              <td style={td} colSpan={3}>Total</td>
              <td style={num}>{rupees(sum("basic_paisa"))}</td><td style={num}>{rupees(sum("allowance_paisa"))}</td><td style={num}>{rupees(sum("bonus_paisa"))}</td>
              <td style={num}>{rupees(sum("absence_cut_paisa"))}</td><td style={num}>{rupees(sum("advance_cut_paisa"))}</td><td style={num}>{rupees(sum("other_cut_paisa"))}</td>
              <td style={num}>{rupees(sum("net_paisa"))}</td><td style={td} colSpan={4} />
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: "12mm", display: "flex", justifyContent: "space-between" }}>
          {["Prepared by (Accounts)", "Checked by (Principal)", "Approved by (Owner)"].map((s) => <span key={s} style={{ borderTop: "1px solid #000", minWidth: "50mm", textAlign: "center" }}>{s}</span>)}
        </div>
      </div>
    </div>
  );
}
