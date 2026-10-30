"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { todayPK } from "@/lib/format";
import { cnic } from "@/lib/board-form";
import { advanceState, salaryFor, PAY_MODE } from "@/lib/payroll";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const paisa = (f: FormData, k: string) => Math.max(0, Math.round(Number(str(f, k).replace(/,/g, "")) * 100) || 0);
const go = (path: string, error?: string, ok?: string): never => {
  const sep = path.includes("?") ? "&" : "?";
  if (error) redirect(`${path}${sep}error=${encodeURIComponent(error)}`);
  revalidatePath(path.split("?")[0]);
  redirect(`${path}${ok ? `${sep}saved=${ok}` : ""}`);
};
const office = () => requireRole("principal", "owner", "accountant");

// ---------- Staff record ----------
export async function saveStaffBasic(f: FormData) {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const id = str(f, "profile_id");
  const role = ["teacher", "accountant"].includes(str(f, "role")) ? str(f, "role") : undefined;
  const { error } = await supabase.from("profiles").update({
    full_name: str(f, "full_name"), phone: str(f, "phone") || null, email: str(f, "email") || null,
    ...(role ? { role } : {}), is_active: f.get("is_active") === "on",
  }).eq("id", id);
  go(`/principal/staff/${id}`, error?.message, "basic");
}

export async function saveStaffDetails(f: FormData) {
  const me = await office();
  const supabase = await createClient();
  const id = str(f, "profile_id");
  if (str(f, "cnic") && !cnic(str(f, "cnic"))) go(`/principal/staff/${id}`, "CNIC must have 13 digits, like 35202-1234567-1.");
  const row: Record<string, unknown> = { profile_id: id, campus_id: me.campus_id, updated_at: new Date().toISOString() };
  const text = ["designation", "gender", "father_or_husband", "marital_status", "address", "emergency_phone", "qualification", "education", "experience", "bank_name", "account_title", "account_no", "wallet_no"];
  // each form sends only its own fields, so only those are written
  for (const k of text) if (f.has(k)) row[k] = str(f, k) || null;
  for (const k of ["date_of_birth", "joining_date"]) if (f.has(k)) row[k] = str(f, k) || null;
  if (f.has("cnic")) row.cnic = cnic(str(f, "cnic"));
  if (f.has("basic_salary")) row.basic_salary_paisa = paisa(f, "basic_salary");
  if (f.has("allowance")) row.allowance_paisa = paisa(f, "allowance");
  if (f.has("pay_mode") && PAY_MODE[str(f, "pay_mode")]) row.pay_mode = str(f, "pay_mode");
  const { error } = await supabase.from("staff_details").upsert(row, { onConflict: "profile_id" });
  go(`/principal/staff/${id}`, error?.message, "details");
}

export async function giveAdvance(f: FormData) {
  const me = await office();
  const supabase = await createClient();
  const id = str(f, "profile_id");
  const amount = paisa(f, "amount");
  if (!amount) go(`/principal/staff/${id}`, "Write the advance amount.");
  const { error } = await supabase.from("salary_advances").insert({
    campus_id: me.campus_id, profile_id: id, amount_paisa: amount, monthly_cut_paisa: paisa(f, "monthly_cut"),
    given_on: str(f, "given_on") || todayPK(), reason: str(f, "reason") || null, given_by: me.id,
  });
  go(`/principal/staff/${id}`, error?.message, "advance");
}

// ---------- Monthly salary sheet ----------
const SHEET = "/principal/staff/salaries";

export async function makeSalarySheet(f: FormData) {
  const me = await office();
  const supabase = await createClient();
  const month = str(f, "month");
  if (!/^\d{4}-\d{2}$/.test(month)) go(SHEET, "Choose the month.");
  const first = `${month}-01`;
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const cutAbsence = f.get("cut_absence") === "on";
  const [{ data: staff }, { data: details }, { data: done }, { data: absents }, { data: advances }, { data: cuts }] = await Promise.all([
    supabase.from("profiles").select("id").in("role", ["principal", "teacher", "accountant"]).eq("is_active", true),
    supabase.from("staff_details").select("profile_id, basic_salary_paisa, allowance_paisa, pay_mode"),
    supabase.from("salary_payments").select("profile_id").eq("month", first),
    supabase.from("staff_attendance").select("profile_id").eq("status", "absent").gte("date", first).lt("date", next),
    supabase.from("salary_advances").select("id, profile_id, amount_paisa, monthly_cut_paisa, given_on"),
    supabase.from("salary_payments").select("profile_id, advance_cut_paisa"),
  ]);
  const have = new Set((done ?? []).map((d) => d.profile_id));
  const det = new Map((details ?? []).map((d) => [d.profile_id, d]));
  const rows = [];
  for (const s of staff ?? []) {
    const d = det.get(s.id);
    if (have.has(s.id) || !d || !Number(d.basic_salary_paisa)) continue;
    const absentDays = (absents ?? []).filter((a) => a.profile_id === s.id).length;
    const adv = advanceState((advances ?? []).filter((a) => a.profile_id === s.id),
      (cuts ?? []).filter((c) => c.profile_id === s.id).reduce((t, c) => t + Number(c.advance_cut_paisa), 0));
    const basic = Number(d.basic_salary_paisa), allowance = Number(d.allowance_paisa);
    const advanceCut = Math.min(adv.dueNow, basic + allowance);
    const { absence, net } = salaryFor({ basic, allowance, absentDays, cutAbsence, advanceCut });
    rows.push({
      campus_id: me.campus_id, profile_id: s.id, month: first, basic_paisa: basic, allowance_paisa: allowance,
      absent_days: absentDays, absence_cut_paisa: absence, advance_cut_paisa: advanceCut, net_paisa: net,
      pay_mode: d.pay_mode, created_by: me.id,
    });
  }
  if (!rows.length) go(`${SHEET}?month=${month}`, have.size ? "Everyone already has this month's salary." : "Set each person's salary on their staff page first.");
  const { error } = await supabase.from("salary_payments").insert(rows);
  go(`${SHEET}?month=${month}`, error?.message, `made-${rows.length}`);
}

export async function updateSalary(f: FormData) {
  await office();
  const supabase = await createClient();
  const id = str(f, "salary_id");
  const back = `${SHEET}?month=${str(f, "month")}`;
  const { data: r } = await supabase.from("salary_payments").select("*").eq("id", id).single();
  if (!r) go(back, "Salary not found.");
  if (r!.status === "paid") go(back, "This salary is already paid.");
  if (f.get("remove") === "1") {
    const { error } = await supabase.from("salary_payments").delete().eq("id", id);
    go(back, error?.message, "removed");
  }
  const bonus = paisa(f, "bonus"), otherCut = paisa(f, "other_cut"), advanceCut = paisa(f, "advance_cut");
  const net = Math.max(0, Number(r!.basic_paisa) + Number(r!.allowance_paisa) + bonus - Number(r!.absence_cut_paisa) - otherCut - advanceCut);
  const { error } = await supabase.from("salary_payments").update({
    bonus_paisa: bonus, other_cut_paisa: otherCut, advance_cut_paisa: advanceCut, net_paisa: net, note: str(f, "note") || null,
  }).eq("id", id);
  go(back, error?.message, "salary");
}

export async function paySalary(f: FormData) {
  await office();
  const supabase = await createClient();
  const back = `${SHEET}?month=${str(f, "month")}`;
  const mode = PAY_MODE[str(f, "pay_mode")] ? str(f, "pay_mode") : "cash";
  const { error } = await supabase.from("salary_payments").update({
    status: "paid", paid_on: str(f, "paid_on") || todayPK(), pay_mode: mode, reference: str(f, "reference") || null,
  }).eq("id", str(f, "salary_id")).eq("status", "due");
  go(back, error?.message, "paid");
}
