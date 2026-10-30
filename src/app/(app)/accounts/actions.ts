"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { feeReminderText, mobilePK } from "@/lib/messages";
import { allRows, familiesByIds, queueForFamilies } from "@/lib/outbox";
import { deliverQueued } from "@/lib/deliver";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
// The school takes fees only in cash or through the two wallets.
const PAYMENT_MODES = ["cash", "jazzcash", "easypaisa"];

export async function recordPayment(f: FormData) {
  const me = await requireRole("accountant", "principal", "owner");
  const supabase = await createClient();
  const family = str(f, "family_id");
  const rupees = Number(str(f, "amount").replace(/,/g, ""));
  if (!rupees || rupees <= 0) redirect(`/accounts?family=${family}&error=${encodeURIComponent("Enter the amount received.")}`);
  const mode = str(f, "mode");
  if (!PAYMENT_MODES.includes(mode)) redirect(`/accounts?family=${family}&error=${encodeURIComponent("Choose Cash, JazzCash or Easypaisa.")}`);
  const { error } = await supabase.from("payments").insert({
    campus_id: me.campus_id,
    family_id: family,
    invoice_id: str(f, "invoice_id") || null,
    amount_paisa: Math.round(rupees * 100),
    mode,
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

// ---------- WhatsApp and SMS ----------
const CHANNELS = ["whatsapp", "sms"];

// Staff tapped Send: the message opens in WhatsApp or the SMS app on their phone, and we note it here.
// With message_id it is a queued message going out; without, a new one written on the spot.
export async function noteSent(m: { message_id?: string; family_id?: string; channel: string; to_phone: string; body: string; kind: string }) {
  const me = await requireRole("accountant", "principal", "owner");
  const supabase = await createClient();
  if (!CHANNELS.includes(m.channel)) return;
  if (m.message_id) {
    await supabase.from("messages").update({ status: "sent", sent_at: new Date().toISOString(), sent_by: me.id }).eq("id", m.message_id);
  } else {
    await supabase.from("messages").insert({
      campus_id: me.campus_id, family_id: m.family_id || null, channel: m.channel, to_phone: m.to_phone,
      body: m.body, kind: m.kind, status: "sent", sent_at: new Date().toISOString(), sent_by: me.id,
    });
  }
  revalidatePath("/accounts/messages");
}

export async function setReminderContact(f: FormData) {
  await requireRole("accountant", "principal", "owner");
  const supabase = await createClient();
  const family = str(f, "family_id");
  const raw = str(f, "reminder_phone");
  if (raw && !mobilePK(raw)) redirect(`/accounts?family=${family}&error=${encodeURIComponent("That is not a mobile number. Write it like 03001234567.")}`);
  const { error } = await supabase.from("families").update({
    reminder_phone: raw || null, reminder_channel: ["auto", ...CHANNELS].includes(str(f, "reminder_channel")) ? str(f, "reminder_channel") : "auto",
  }).eq("id", family);
  if (error) redirect(`/accounts?family=${family}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/accounts");
  redirect(`/accounts?family=${family}&saved=contact`);
}

// One reminder per owing family, each on its recommended channel, into the outbox.
export async function queueFeeReminders() {
  const me = await requireRole("accountant", "principal", "owner");
  const supabase = await createClient();
  const owing = await allRows<{ family_id: string; balance_paisa: number }>((a, b) =>
    supabase.from("family_balances").select("family_id, balance_paisa").gt("balance_paisa", 0).order("family_id").range(a, b));
  const balance = new Map(owing.map((o) => [o.family_id, Number(o.balance_paisa)]));
  const families = await familiesByIds(supabase, [...balance.keys()]);
  const { data: inv } = await supabase.from("invoices").select("billing_month, due_on").order("billing_month", { ascending: false }).limit(1).maybeSingle();
  const res = await queueForFamilies(supabase, {
    campusId: me.campus_id, families, kind: "fee_reminder", fees: true,
    text: (fam) => feeReminderText({ familyName: fam.name, balancePaisa: balance.get(fam.id) ?? 0, dueOn: inv?.due_on ?? null, campus: me.campus_name }),
  });
  if (res.error) redirect(`/accounts/messages?error=${encodeURIComponent(res.error)}`);
  const d = await deliverQueued(supabase);
  revalidatePath("/accounts/messages");
  redirect(`/accounts/messages?queued=${res.queued}&skipped=${res.skipped}&sent=${d.sent}&failed=${d.failed}`);
}

// Sends what is waiting through the connected WhatsApp Business number or SMS gateway.
export async function sendWaitingNow() {
  await requireRole("accountant", "principal", "owner");
  const supabase = await createClient();
  const d = await deliverQueued(supabase);
  revalidatePath("/accounts/messages");
  redirect(`/accounts/messages?sent=${d.sent}&failed=${d.failed}&left=${d.left}`);
}

export async function retryFailed() {
  await requireRole("accountant", "principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.from("messages").update({ status: "queued", error: null }).eq("status", "failed");
  if (error) redirect(`/accounts/messages?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/accounts/messages");
  redirect("/accounts/messages");
}

export async function cancelQueued(f: FormData) {
  await requireRole("accountant", "principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.from("messages").update({ status: "cancelled" }).eq("id", str(f, "message_id")).in("status", ["queued", "failed"]);
  if (error) redirect(`/accounts/messages?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/accounts/messages");
  redirect("/accounts/messages");
}
