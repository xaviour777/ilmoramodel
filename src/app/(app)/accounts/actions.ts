"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function recordPayment(f: FormData) {
  const me = await requireRole("accountant", "principal", "owner");
  const supabase = await createClient();
  const family = str(f, "family_id");
  const rupees = Number(str(f, "amount").replace(/,/g, ""));
  if (!rupees || rupees <= 0) redirect(`/accounts?family=${family}&error=${encodeURIComponent("Enter the amount received.")}`);
  const { error } = await supabase.from("payments").insert({
    campus_id: me.campus_id,
    family_id: family,
    invoice_id: str(f, "invoice_id") || null,
    amount_paisa: Math.round(rupees * 100),
    mode: str(f, "mode"),
    reference: str(f, "reference") || null,
    receipt_no: str(f, "receipt_no") || null,
    received_by: me.id,
    idempotency_key: str(f, "idempotency_key"), // same form submitted twice = one payment
  });
  if (error && !error.message.includes("payments_idempotency_key_key")) {
    redirect(`/accounts?family=${family}&error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/accounts");
  redirect(`/accounts?family=${family}&saved=1`);
}
