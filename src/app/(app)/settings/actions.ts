"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { loadMessagingConfig, sendOne } from "@/lib/deliver";
import { mobilePK } from "@/lib/messages";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (q: string): never => redirect(`/settings?${q}`);

// Saves the WhatsApp Business or SMS gateway connection. A blank token or key keeps the saved one.
export async function saveMessaging(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const which = str(f, "which");
  const smsUrl = str(f, "sms_url");
  if (which === "sms" && smsUrl && !smsUrl.startsWith("https://")) back(`error=${encodeURIComponent("The gateway address must start with https://")}`);
  const settings = which === "whatsapp"
    ? {
        whatsapp_enabled: f.get("enabled") === "on", whatsapp_phone_number_id: str(f, "phone_number_id") || null,
        whatsapp_template: str(f, "template") || null, whatsapp_template_lang: str(f, "template_lang") || "en",
      }
    : {
        sms_enabled: f.get("enabled") === "on", sms_method: str(f, "method") === "POST" ? "POST" : "GET",
        sms_url: smsUrl || null, sms_body: str(f, "body") || null, sms_sender: str(f, "sender") || null,
      };
  const row = { campus_id: me.campus_id, ...settings, updated_by: me.id, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("campus_settings").upsert(row, { onConflict: "campus_id" });
  if (error) back(`error=${encodeURIComponent(error.message)}`);

  const secret = str(f, "secret");
  if (secret || f.get("clear_secret") === "on") {
    const col = which === "whatsapp" ? "whatsapp_token" : "sms_api_key";
    const { error: e2 } = await supabase.from("campus_secrets").upsert({ campus_id: me.campus_id, [col]: secret || null }, { onConflict: "campus_id" });
    if (e2) back(`error=${encodeURIComponent(e2.message)}`);
  }
  revalidatePath("/settings");
  back(`saved=${which}`);
}

// Sends one test message to a number the principal types, so they see the connection works.
export async function sendTest(f: FormData) {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const which = str(f, "which") === "sms" ? "sms" : "whatsapp";
  const to = mobilePK(str(f, "to"));
  if (!to) back(`error=${encodeURIComponent("Write the test number like 03001234567.")}`);
  const config = await loadMessagingConfig(supabase);
  if (!config) back(`error=${encodeURIComponent("Save the settings first.")}`);
  try {
    await sendOne(config!, which, to!, "Ilmora test: yeh message school ke system se aaya hai. Connection theek hai.");
  } catch (e) {
    back(`error=${encodeURIComponent(`Test failed: ${(e as Error).message}`)}`);
  }
  back(`tested=${which}`);
}

// Parents get a message when their child is marked absent (on by default).
export async function saveAbsentAlerts(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.from("campus_settings")
    .upsert({ campus_id: me.campus_id, absent_alerts: f.get("absent_alerts") === "on", updated_by: me.id, updated_at: new Date().toISOString() }, { onConflict: "campus_id" });
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  revalidatePath("/settings");
  back("saved=1");
}
