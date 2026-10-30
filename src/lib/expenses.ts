import type { createClient } from "@/lib/supabase/server";
import { allRows } from "@/lib/outbox";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Category = { id: string; name: string; parent_id: string | null; sort: number; is_active: boolean };
export type Expense = {
  id: string; category_id: string; spent_on: string; amount_paisa: number; paid_to: string | null; mode: string;
  reference: string | null; note: string | null; voucher_no: string | null; voided: boolean; void_reason: string | null;
};

// "2026-11" -> ["2026-11-01", "2026-12-01"]
export const monthRange = (m: string) => {
  const next = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)).toISOString().slice(0, 10);
  return [`${m}-01`, next] as const;
};

export async function loadCategories(supabase: Supabase) {
  const { data } = await supabase.from("expense_categories").select("id, name, parent_id, sort, is_active").order("sort").order("name");
  const all = (data ?? []) as Category[];
  const groups = all.filter((c) => !c.parent_id);
  const subsOf = (g: string) => all.filter((c) => c.parent_id === g);
  // a sub-category's main group, or the category itself when it is a main group
  const groupOf = new Map(all.map((c) => [c.id, c.parent_id ?? c.id]));
  return { all, groups, subsOf, groupOf, byId: new Map(all.map((c) => [c.id, c])) };
}

export async function loadExpenses(supabase: Supabase, from: string, to: string) {
  return allRows<Expense>((a, b) => supabase.from("expenses")
    .select("id, category_id, spent_on, amount_paisa, paid_to, mode, reference, note, voucher_no, voided, void_reason")
    .gte("spent_on", from).lt("spent_on", to).order("spent_on", { ascending: false }).order("id").range(a, b));
}
