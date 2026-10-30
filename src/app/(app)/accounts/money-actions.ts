"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { todayPK } from "@/lib/format";
import { CALL_RESULT, EXPENSE_MODES, STANDARD_EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { cashForDay } from "@/lib/day-close";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const paisa = (f: FormData, k: string) => Math.max(0, Math.round(Number(str(f, k).replace(/,/g, "")) * 100) || 0);
const office = () => requireRole("accountant", "principal", "owner");
const go = (path: string, error?: string, ok?: string): never => {
  const sep = path.includes("?") ? "&" : "?";
  if (error) redirect(`${path}${sep}error=${encodeURIComponent(error)}`);
  revalidatePath(path.split("?")[0]);
  redirect(`${path}${ok ? `${sep}saved=${ok}` : ""}`);
};

// ---------- Day close ----------
export async function closeDay(f: FormData) {
  const me = await office();
  const supabase = await createClient();
  const date = str(f, "date") || todayPK();
  // a cashier closes their own day; the principal can close anyone's
  const cashier = me.role === "accountant" ? me.id : str(f, "cashier_id") || me.id;
  const back = `/accounts/day-close?date=${date}&cashier=${cashier}`;
  if (!str(f, "counted")) go(back, "Count the cash in the drawer and write the total.");
  const c = await cashForDay(supabase, date, cashier);
  const counted = paisa(f, "counted");
  const { error } = await supabase.from("day_closes").upsert({
    campus_id: me.campus_id, date, cashier_id: cashier, cash_received_paisa: c.cash, cash_spent_paisa: c.cashSpent,
    jazzcash_paisa: c.jazzcash, easypaisa_paisa: c.easypaisa, counted_paisa: counted, deposited_paisa: paisa(f, "deposited"),
    deposit_ref: str(f, "deposit_ref") || null, difference_paisa: counted - c.expected, note: str(f, "note") || null,
    closed_by: me.id, closed_at: new Date().toISOString(),
  }, { onConflict: "campus_id,date,cashier_id" });
  go(back, error?.message, "closed");
}

// ---------- Defaulter calls ----------
export async function logCall(f: FormData) {
  const me = await office();
  const supabase = await createClient();
  const result = CALL_RESULT[str(f, "result")] ? str(f, "result") : null;
  const back = `/accounts/calls${str(f, "view") ? `?view=${str(f, "view")}` : ""}`;
  if (!result) go(back, "Choose what happened on the call.");
  if (result === "promised" && !str(f, "promise_on")) go(back, "Write the date they promised to pay.");
  const { error } = await supabase.from("fee_calls").insert({
    campus_id: me.campus_id, family_id: str(f, "family_id"), result,
    promise_on: result === "promised" ? str(f, "promise_on") : null,
    promise_paisa: result === "promised" ? paisa(f, "promise_amount") || null : null,
    note: str(f, "note") || null, called_by: me.id,
  });
  go(back, error?.message, "call");
}

// ---------- Expenses ----------
export async function addExpense(f: FormData) {
  const me = await office();
  const supabase = await createClient();
  const back = `/accounts/expenses${str(f, "month") ? `?month=${str(f, "month")}` : ""}`;
  const amount = paisa(f, "amount");
  if (!amount) go(back, "Write the amount.");
  if (!str(f, "category_id")) go(back, "Choose a category.");
  const mode = EXPENSE_MODES[str(f, "mode")] ? str(f, "mode") : "cash";
  // voucher numbers run per month: EV-2611-0001
  const day = str(f, "spent_on") || todayPK();
  const tag = `EV-${day.slice(2, 4)}${day.slice(5, 7)}-`;
  const { data: last } = await supabase.from("expenses").select("voucher_no").like("voucher_no", `${tag}%`).order("voucher_no", { ascending: false }).limit(1);
  const n = (Number(last?.[0]?.voucher_no?.slice(tag.length)) || 0) + 1;
  const { error } = await supabase.from("expenses").insert({
    campus_id: me.campus_id, category_id: str(f, "category_id"), spent_on: day, amount_paisa: amount,
    paid_to: str(f, "paid_to") || null, mode, reference: str(f, "reference") || null, note: str(f, "note") || null,
    voucher_no: `${tag}${String(n).padStart(4, "0")}`, created_by: me.id,
  });
  go(back, error?.message, "expense");
}

export async function voidExpense(f: FormData) {
  const me = await office();
  const supabase = await createClient();
  const back = `/accounts/expenses${str(f, "month") ? `?month=${str(f, "month")}` : ""}`;
  if (!str(f, "reason")) go(back, "Write why this expense is being voided.");
  const { error } = await supabase.from("expenses").update({ voided: true, void_reason: str(f, "reason"), voided_by: me.id }).eq("id", str(f, "expense_id"));
  go(back, error?.message, "voided");
}

export async function addStandardCategories() {
  const me = await office();
  const supabase = await createClient();
  const { data: have } = await supabase.from("expense_categories").select("id, name, parent_id");
  const groupId = new Map((have ?? []).filter((c) => !c.parent_id).map((c) => [c.name, c.id]));
  let sort = 0;
  for (const [group, subs] of STANDARD_EXPENSE_CATEGORIES) {
    sort += 10;
    let gid = groupId.get(group);
    if (!gid) {
      const { data, error } = await supabase.from("expense_categories").insert({ campus_id: me.campus_id, name: group, sort }).select("id").single();
      if (error || !data) go("/accounts/expenses/categories", error?.message ?? "Could not add.");
      gid = data!.id;
    }
    const existing = new Set((have ?? []).filter((c) => c.parent_id === gid).map((c) => c.name));
    const rows = subs.filter((s) => !existing.has(s)).map((s, i) => ({ campus_id: me.campus_id, parent_id: gid, name: s, sort: i + 1 }));
    if (rows.length) {
      const { error } = await supabase.from("expense_categories").insert(rows);
      if (error) go("/accounts/expenses/categories", error.message);
    }
  }
  go("/accounts/expenses/categories", undefined, "standard");
}

export async function addCategory(f: FormData) {
  const me = await office();
  const supabase = await createClient();
  if (!str(f, "name")) go("/accounts/expenses/categories", "Write the category name.");
  const { error } = await supabase.from("expense_categories").insert({
    campus_id: me.campus_id, name: str(f, "name"), parent_id: str(f, "parent_id") || null, sort: 999,
  });
  go("/accounts/expenses/categories", error?.message?.includes("duplicate") ? "That category is already there." : error?.message, "category");
}

export async function editCategory(f: FormData) {
  await office();
  const supabase = await createClient();
  if (!str(f, "name")) go("/accounts/expenses/categories", "Write the category name.");
  const { error } = await supabase.from("expense_categories")
    .update({ name: str(f, "name"), is_active: f.get("is_active") === "on" }).eq("id", str(f, "category_id"));
  go("/accounts/expenses/categories", error?.message, "category");
}
