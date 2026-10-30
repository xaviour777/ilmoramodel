"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { todayPK } from "@/lib/format";
import { feeReminderText, mobilePK } from "@/lib/messages";
import { allRows, familiesByIds, queueForFamilies } from "@/lib/outbox";
import { deliverQueued } from "@/lib/deliver";
import { challanTag } from "@/lib/challan";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
// The school takes fees only in cash or through the two wallets.
const PAYMENT_MODES = ["cash", "jazzcash", "easypaisa"];

// R-YYMM-00001, continuing from the highest number this month
async function nextReceiptNo(supabase: Awaited<ReturnType<typeof createClient>>) {
  const tag = `R-${todayPK().slice(2, 4)}${todayPK().slice(5, 7)}-`;
  const { data } = await supabase.from("payments").select("receipt_no").like("receipt_no", `${tag}%`).order("receipt_no", { ascending: false }).limit(1);
  const n = Number(data?.[0]?.receipt_no?.slice(tag.length)) || 0;
  return `${tag}${String(n + 1).padStart(5, "0")}`;
}

export async function recordPayment(f: FormData) {
  const me = await requireRole("accountant", "principal", "owner");
  const supabase = await createClient();
  const family = str(f, "family_id");
  const rupees = Number(str(f, "amount").replace(/,/g, ""));
  if (!rupees || rupees <= 0) redirect(`/accounts?family=${family}&error=${encodeURIComponent("Enter the amount received.")}`);
  const mode = str(f, "mode");
  if (!PAYMENT_MODES.includes(mode)) redirect(`/accounts?family=${family}&error=${encodeURIComponent("Choose Cash, JazzCash or Easypaisa.")}`);
  const key = str(f, "idempotency_key"); // same form submitted twice = one payment
  const { error } = await supabase.from("payments").insert({
    campus_id: me.campus_id,
    family_id: family,
    invoice_id: str(f, "invoice_id") || null,
    amount_paisa: Math.round(rupees * 100),
    mode,
    reference: str(f, "reference") || null,
    receipt_no: str(f, "receipt_no") || (await nextReceiptNo(supabase)),
    received_by: me.id,
    idempotency_key: key,
  });
  if (error && !error.message.includes("payments_idempotency_key_key")) {
    redirect(`/accounts?family=${family}&error=${encodeURIComponent(error.message)}`);
  }
  const { data: paid } = await supabase.from("payments").select("id").eq("idempotency_key", key).maybeSingle();
  revalidatePath("/accounts");
  redirect(`/accounts?family=${family}&saved=1${paid ? `&receipt=${paid.id}` : ""}`);
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

// ---------- Fee setup and monthly challans ----------
const rupeesToPaisa = (v: string) => Math.round(Number(v.replace(/,/g, "") || 0) * 100);

export async function saveFeeStructure(f: FormData) {
  const me = await requireRole("accountant", "principal", "owner");
  const supabase = await createClient();
  // inputs are named fee:<class id>:<head id>
  const rows: { campus_id: string; class_id: string; fee_head_id: string; amount_paisa: number; monthly: boolean }[] = [];
  const empty: [string, string][] = [];
  for (const [k, v] of f.entries()) {
    const [tag, cls, head] = k.split(":");
    if (tag !== "fee") continue;
    const paisa = rupeesToPaisa(String(v));
    if (paisa > 0) rows.push({ campus_id: me.campus_id, class_id: cls, fee_head_id: head, amount_paisa: paisa, monthly: f.get(`monthly:${head}`) === "on" });
    else empty.push([cls, head]);
  }
  const { error } = rows.length ? await supabase.from("fee_structures").upsert(rows, { onConflict: "class_id,fee_head_id" }) : { error: null };
  if (error) redirect(`/accounts/setup?error=${encodeURIComponent(error.message)}`);
  for (const [cls, head] of empty) await supabase.from("fee_structures").delete().eq("class_id", cls).eq("fee_head_id", head);
  revalidatePath("/accounts/setup");
  redirect("/accounts/setup?saved=fees");
}

export async function addFeeHead(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.from("fee_heads").insert({ campus_id: me.campus_id, name: str(f, "name"), priority: Number(str(f, "priority")) || 100 });
  if (error) redirect(`/accounts/setup?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/accounts/setup");
  redirect("/accounts/setup?saved=head");
}

// One challan per family for the month: a line per child per fee head of the child's class.
// Families that already have that month's challan are skipped, so pressing twice is safe.
export async function generateChallans(f: FormData) {
  const me = await requireRole("accountant", "principal", "owner");
  const supabase = await createClient();
  const month = str(f, "month");                       // YYYY-MM
  const due = str(f, "due_on");
  const sibling = Math.min(100, Math.max(0, Number(str(f, "sibling_percent")) || 0));
  const oneTime = f.get("one_time") === "on";
  if (!/^\d{4}-\d{2}$/.test(month) || !due) redirect(`/accounts/setup?error=${encodeURIComponent("Choose the month and the last date.")}`);
  const billing = `${month}-01`;

  const [students, { data: secRows }, { data: structures }, { data: heads }, existing] = await Promise.all([
    allRows<{ id: string; full_name: string; family_id: string; section_id: string | null }>((a, b) =>
      supabase.from("students").select("id, full_name, family_id, section_id").eq("status", "enrolled").order("id").range(a, b)),
    supabase.from("sections").select("id, class_id"),
    supabase.from("fee_structures").select("class_id, fee_head_id, amount_paisa, monthly"),
    supabase.from("fee_heads").select("id, name, priority"),
    allRows<{ family_id: string; challan_no: string }>((a, b) =>
      supabase.from("invoices").select("family_id, challan_no").eq("billing_month", billing).order("id").range(a, b)),
  ]);
  const headName = new Map((heads ?? []).map((h) => [h.id, h.name]));
  const done = new Set(existing.map((e) => e.family_id));
  const classOf = new Map((secRows ?? []).map((x) => [x.id, x.class_id as string]));
  const byFamily = new Map<string, typeof students>();
  for (const s of students) {
    if (!s.section_id || done.has(s.family_id)) continue;
    byFamily.set(s.family_id, [...(byFamily.get(s.family_id) ?? []), s]);
  }
  if (!byFamily.size) redirect(`/accounts/setup?error=${encodeURIComponent(done.size ? "Every family already has this month's challan." : "No enrolled students with a class.")}`);

  // challan numbers continue from the highest one this month: <campus initials>-<YYMM>-0001
  let n = existing.reduce((m, e) => Math.max(m, Number(e.challan_no.split("-").pop()) || 0), 0);
  const tag = challanTag(me.campus_name, month);

  const families = [...byFamily.entries()];
  for (let i = 0; i < families.length; i += 300) {
    const batch = families.slice(i, i + 300);
    const { data: invs, error } = await supabase.from("invoices").insert(batch.map(([family]) => ({
      campus_id: me.campus_id, family_id: family, billing_month: billing, due_on: due, challan_no: `${tag}-${String(++n).padStart(4, "0")}`,
    }))).select("id, family_id");
    if (error) redirect(`/accounts/setup?error=${encodeURIComponent(error.message)}`);
    const invoiceOf = new Map((invs ?? []).map((v) => [v.family_id, v.id]));
    const lines: { campus_id: string; invoice_id: string; student_id: string | null; fee_head_id: string | null; description: string; amount_paisa: number }[] = [];
    for (const [family, kids] of batch) {
      kids.forEach((k, idx) => {
        for (const fs of (structures ?? []).filter((x) => x.class_id === classOf.get(k.section_id!) && (x.monthly || oneTime))) {
          lines.push({ campus_id: me.campus_id, invoice_id: invoiceOf.get(family)!, student_id: k.id, fee_head_id: fs.fee_head_id, description: `${headName.get(fs.fee_head_id)}, ${k.full_name}`, amount_paisa: Number(fs.amount_paisa) });
          // second child onwards: concession on tuition-type (monthly) heads only
          if (sibling && idx > 0 && fs.monthly) {
            lines.push({ campus_id: me.campus_id, invoice_id: invoiceOf.get(family)!, student_id: k.id, fee_head_id: fs.fee_head_id, description: `Sibling concession ${sibling}%, ${k.full_name}`, amount_paisa: -Math.round(Number(fs.amount_paisa) * sibling / 100) });
          }
        }
      });
    }
    for (let j = 0; j < lines.length; j += 1000) {
      const { error: e2 } = await supabase.from("invoice_lines").insert(lines.slice(j, j + 1000));
      if (e2) redirect(`/accounts/setup?error=${encodeURIComponent(e2.message)}`);
    }
  }
  revalidatePath("/accounts");
  redirect(`/accounts/setup?made=${families.length}&month=${month}`);
}
