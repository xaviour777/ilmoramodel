"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { JAZZ_URL, jazzFields, jazzReady } from "@/lib/jazzcash";

// A parent starts paying the family's balance (or one challan) on JazzCash's own page.
export async function startJazzCash(invoiceId: string | null, amountPaisa: number) {
  await requireRole("parent");
  if (!jazzReady()) return { error: "Online card/wallet payment is not switched on yet." };
  const sb = await createClient();
  const { data: bal } = await sb.from("family_balances").select("family_id, balance_paisa").gt("balance_paisa", 0).limit(1).maybeSingle();
  if (!bal) return { error: "Nothing to pay right now." };
  const amount = Math.min(Math.round(amountPaisa), Number(bal.balance_paisa));
  if (amount < 100) return { error: "Amount is too small." };
  const ref = "IL" + Date.now().toString() + Math.floor(Math.random() * 90 + 10);
  const { data: inv } = invoiceId ? await sb.from("invoices").select("challan_no").eq("id", invoiceId).maybeSingle() : { data: null };
  const { error } = await sb.from("online_payments").insert({ family_id: bal.family_id, invoice_id: invoiceId, amount_paisa: amount, ref });
  if (error) return { error: error.message };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return { url: JAZZ_URL, fields: jazzFields({ ref, amountPaisa: amount, bill: inv?.challan_no ?? ref, description: "School fee", returnUrl: `${proto}://${host}/api/pay/jazzcash` }) };
}
