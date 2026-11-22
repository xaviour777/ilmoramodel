"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const baseOf = (f: FormData) => (str(f, "base") === "/student/shop" ? "/student/shop" : "/parent/shop");

// Order for one child. Prices, stock and the total are worked out in the database.
export async function placeShopOrder(f: FormData) {
  await requireRole("parent", "student");
  const base = baseOf(f);
  const kid = str(f, "student_id");
  const lines = [...f.entries()]
    .filter(([k, v]) => k.startsWith("q_") && Number(v) > 0)
    .map(([k, v]) => ({ item_id: k.slice(2), qty: Number(v) }));
  const fail = (m: string): never => redirect(`${base}?kid=${kid}&error=${encodeURIComponent(m)}`);
  if (lines.length === 0) fail("Choose how many of at least one item.");
  const mode = str(f, "mode") || "cash";
  const sb = await createClient();
  const { error } = await sb.rpc("place_shop_order", {
    p_student: kid, p_lines: lines, p_mode: mode,
    p_txn: mode === "cash" ? null : str(f, "txn_id").replace(/\s+/g, ""), p_note: str(f, "note") || null,
  });
  if (error) fail(error.message);
  revalidatePath(base);
  redirect(`${base}?kid=${kid}&sent=1`);
}

export async function cancelShopOrder(f: FormData) {
  await requireRole("parent", "student");
  const base = baseOf(f);
  const sb = await createClient();
  const { error } = await sb.rpc("cancel_my_shop_order", { p_order: str(f, "id") });
  revalidatePath(base);
  redirect(error ? `${base}?error=${encodeURIComponent(error.message)}` : base);
}
