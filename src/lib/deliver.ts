import { createClient } from "@/lib/supabase/server";
import type { Channel } from "@/lib/messages";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type MessagingConfig = {
  whatsapp_enabled: boolean;
  whatsapp_phone_number_id: string | null;
  whatsapp_template: string | null;
  whatsapp_template_lang: string;
  sms_enabled: boolean;
  sms_method: "GET" | "POST";
  sms_url: string | null;
  sms_body: string | null;
  sms_sender: string | null;
  whatsapp_token: string | null;
  sms_api_key: string | null;
};

export const SETTINGS_COLS = "whatsapp_enabled, whatsapp_phone_number_id, whatsapp_template, whatsapp_template_lang, sms_enabled, sms_method, sms_url, sms_body, sms_sender";

export async function loadMessagingConfig(supabase: Supabase): Promise<MessagingConfig | null> {
  const [{ data: s }, { data: k }] = await Promise.all([
    supabase.from("campus_settings").select(SETTINGS_COLS).maybeSingle(),
    supabase.from("campus_secrets").select("whatsapp_token, sms_api_key").maybeSingle(),
  ]);
  return s ? { ...(s as Omit<MessagingConfig, "whatsapp_token" | "sms_api_key">), whatsapp_token: k?.whatsapp_token ?? null, sms_api_key: k?.sms_api_key ?? null } : null;
}

// Which channels can go out without a tap.
export function readyChannels(c: MessagingConfig | null): Channel[] {
  const out: Channel[] = [];
  if (c?.whatsapp_enabled && c.whatsapp_phone_number_id && c.whatsapp_token) out.push("whatsapp");
  if (c?.sms_enabled && c.sms_url) out.push("sms");
  return out;
}

const META_API = "https://graph.facebook.com/v21.0";

// WhatsApp Business (Meta Cloud API). Messages a school starts must use an approved template;
// ours has one body variable that carries the whole text. Without a template, plain text only
// reaches parents who messaged the school in the last 24 hours.
async function sendWhatsApp(c: MessagingConfig, to: string, text: string) {
  const body = c.whatsapp_template
    ? {
        messaging_product: "whatsapp", to, type: "template",
        template: {
          name: c.whatsapp_template, language: { code: c.whatsapp_template_lang || "en" },
          // template variables can't hold new lines or long runs of spaces
          components: [{ type: "body", parameters: [{ type: "text", text: text.replace(/\s*\n\s*/g, " · ").slice(0, 1000) }] }],
        },
      }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: text } };
  const res = await fetch(`${META_API}/${encodeURIComponent(c.whatsapp_phone_number_id!)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.whatsapp_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.error?.message ?? `WhatsApp said ${res.status}`);
  }
}

// Any HTTP SMS gateway: the URL (and POST body) carry {to} {to_local} {message} {sender} {key}.
export function fillSmsTemplate(tpl: string, v: Record<string, string>, encode: (s: string) => string) {
  return tpl.replace(/\{(to|to_local|message|sender|key)\}/g, (_, k: string) => encode(v[k] ?? ""));
}

async function sendSms(c: MessagingConfig, to: string, text: string) {
  const v = { to, to_local: "0" + to.slice(2), message: text, sender: c.sms_sender ?? "", key: c.sms_api_key ?? "" };
  const url = fillSmsTemplate(c.sms_url!, v, encodeURIComponent);
  const isJson = (c.sms_body ?? "").trim().startsWith("{");
  const res = await fetch(url, c.sms_method === "POST"
    ? {
        method: "POST",
        headers: { "Content-Type": isJson ? "application/json" : "application/x-www-form-urlencoded" },
        body: fillSmsTemplate(c.sms_body ?? "", v, isJson ? (s) => JSON.stringify(s).slice(1, -1) : encodeURIComponent),
        signal: AbortSignal.timeout(15000),
      }
    : { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`SMS gateway said ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
}

export async function sendOne(c: MessagingConfig, channel: Channel, to: string, text: string) {
  return channel === "whatsapp" ? sendWhatsApp(c, to, text) : sendSms(c, to, text);
}

// Sends waiting messages on the connected channels, a few at a time, and records each result.
// Stops after `limit` so one click never runs past the server's time limit; the rest stay queued.
export async function deliverQueued(supabase: Supabase, limit = 60) {
  const config = await loadMessagingConfig(supabase);
  const channels = readyChannels(config);
  if (!channels.length) return { sent: 0, failed: 0, left: 0, channels };
  const { data: queued, count } = await supabase.from("messages").select("id, channel, to_phone, body", { count: "exact" })
    .eq("status", "queued").in("channel", channels).order("created_at").limit(limit);
  let sent = 0, failed = 0;
  const list = queued ?? [];
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).map(async (m) => {
      try {
        await sendOne(config!, m.channel as Channel, m.to_phone, m.body);
        await supabase.from("messages").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", m.id);
        sent++;
      } catch (e) {
        await supabase.from("messages").update({ status: "failed", error: (e as Error).message.slice(0, 300) }).eq("id", m.id);
        failed++;
      }
    }));
  }
  return { sent, failed, left: Math.max(0, (count ?? 0) - list.length), channels };
}
