"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { todayPK } from "@/lib/format";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const fail = (m: string): never => redirect(`/parent/fees?error=${encodeURIComponent(m)}#pay`);

// "I have paid": the parent paid the school's wallet account and sends the transaction ID.
// The fee office checks its JazzCash or Easypaisa account and confirms it into a receipt.
export async function sendPaymentClaim(f: FormData) {
  const me = await requireRole("parent");
  const supabase = await createClient();
  const mode = str(f, "mode");
  if (mode !== "jazzcash" && mode !== "easypaisa") fail("Choose JazzCash or Easypaisa.");
  const rupees = Number(str(f, "amount").replace(/,/g, ""));
  if (!rupees || rupees <= 0 || rupees > 1_000_000) fail("Enter the amount you sent.");
  const txn = str(f, "txn_id").replace(/\s+/g, "");
  if (txn.length < 4 || txn.length > 40) fail("Enter the transaction ID from your JazzCash or Easypaisa message.");
  const paidOn = str(f, "paid_on") || todayPK();
  if (paidOn > todayPK()) fail("The payment date can't be in the future.");
  const { error } = await supabase.from("payment_claims").insert({
    campus_id: me.campus_id, family_id: str(f, "family_id"), invoice_id: str(f, "invoice_id") || null,
    amount_paisa: Math.round(rupees * 100), mode, txn_id: txn, paid_on: paidOn, sender_phone: str(f, "sender_phone") || null,
  });
  if (error) fail(error.message.includes("payment_claims_campus_id_mode_txn_id_key") ? "This transaction ID was already sent." : error.message);
  revalidatePath("/parent/fees");
  redirect("/parent/fees?sent=1#pay");
}
