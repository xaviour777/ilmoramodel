import type { createClient } from "@/lib/supabase/server";
import { pkDayRange } from "@/lib/expense-categories";

// What one cashier should have in the drawer for a day: cash fees taken minus cash expenses paid.
export async function cashForDay(supabase: Awaited<ReturnType<typeof createClient>>, date: string, cashierId: string) {
  const [from, to] = pkDayRange(date);
  const [{ data: pays }, { data: spent }] = await Promise.all([
    supabase.from("payments").select("amount_paisa, mode").eq("received_by", cashierId).gte("received_at", from).lt("received_at", to),
    supabase.from("expenses").select("amount_paisa").eq("created_by", cashierId).eq("spent_on", date).eq("mode", "cash").eq("voided", false),
  ]);
  const by = (m: string) => (pays ?? []).filter((p) => p.mode === m).reduce((t, p) => t + Number(p.amount_paisa), 0);
  const cashSpent = (spent ?? []).reduce((t, e) => t + Number(e.amount_paisa), 0);
  return { cash: by("cash"), jazzcash: by("jazzcash"), easypaisa: by("easypaisa"), receipts: (pays ?? []).length, cashSpent, expected: by("cash") - cashSpent };
}
