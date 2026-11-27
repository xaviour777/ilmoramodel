import { createClient } from "@/lib/supabase/server";
import type { Channel } from "@/lib/messages";
import { evoReady, evoSend } from "@/lib/evolution";
import { todayPK } from "@/lib/format";

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
  // numbers linked by QR scan (WhatsApp module); used before the Business API when present
  qr_numbers?: QrNumber[];
};
export type QrNumber = { id: string; instance: string; daily_limit: number; sent_today: number; sent_on: string | null; last_used_at: string | null };

export const SETTINGS_COLS = "whatsapp_enabled, whatsapp_phone_number_id, whatsapp_template, whatsapp_template_lang, sms_enabled, sms_method, sms_url, sms_body, sms_sender";

// `campusId` is given by server jobs that run without a signed-in person (service key).
export async function loadMessagingConfig(supabase: Supabase, campusId?: string): Promise<MessagingConfig | null> {
  const one = <T,>(q: T) => (campusId ? (q as unknown as { eq: (c: string, v: string) => T }).eq("campus_id", campusId) : q);
  const [{ data: s }, { data: k }] = await Promise.all([
    one(supabase.from("campus_settings").select(SETTINGS_COLS)).maybeSingle(),
    one(supabase.from("campus_secrets").select("whatsapp_token, sms_api_key")).maybeSingle(),
  ]);
  let qr: QrNumber[] = [];
  if (evoReady()) {
    const [{ data: on }, { data: nums }] = await Promise.all([
      campusId ? Promise.resolve({ data: true }) : supabase.rpc("has_module", { p_module: "whatsapp" }),
      one(supabase.from("wa_numbers").select("id, instance, daily_limit, sent_today, sent_on, last_used_at").eq("status", "connected")),
    ]);
    if (on) qr = (nums ?? []) as QrNumber[];
  }
  return s ? { ...(s as Omit<MessagingConfig, "whatsapp_token" | "sms_api_key">), whatsapp_token: k?.whatsapp_token ?? null, sms_api_key: k?.sms_api_key ?? null, qr_numbers: qr } : null;
}

// Which channels can go out without a tap.
export function readyChannels(c: MessagingConfig | null): Channel[] {
  const out: Channel[] = [];
  if ((c?.whatsapp_enabled && c.whatsapp_phone_number_id && c.whatsapp_token) || (c?.qr_numbers?.length ?? 0) > 0) out.push("whatsapp");
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
export async function deliverQueued(supabase: Supabase, limit = 60, campusId?: string) {
  const config = await loadMessagingConfig(supabase, campusId);
  const channels = readyChannels(config);
  if (!channels.length) return { sent: 0, failed: 0, left: 0, channels };
  let q = supabase.from("messages").select("id, channel, to_phone, body", { count: "exact" }).eq("status", "queued").in("channel", channels);
  if (campusId) q = q.eq("campus_id", campusId);
  const { data: queued, count } = await q.order("created_at").limit(limit);
  let sent = 0, failed = 0;
  const list = queued ?? [];
  const qr = config!.qr_numbers ?? [];
  if (qr.length) {
    // QR-linked numbers: one at a time, spread over the numbers, with a pause between
    // messages and a daily cap per number, so the traffic looks like a person and not a bot.
    const today = todayPK();
    for (const n of qr) if (n.sent_on !== today) { n.sent_today = 0; n.sent_on = today; }
    const started = Date.now();
    for (const m of list) {
      if (Date.now() - started > 45000) break;           // stay inside the server's time limit
      if (m.channel !== "whatsapp") {
        try { await sendOne(config!, m.channel as Channel, m.to_phone, m.body); await supabase.from("messages").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", m.id); sent++; }
        catch (e) { await supabase.from("messages").update({ status: "failed", error: (e as Error).message.slice(0, 300) }).eq("id", m.id); failed++; }
        continue;
      }
      const n = qr.filter((x) => x.sent_today < x.daily_limit).sort((a, b) => a.sent_today - b.sent_today || (a.last_used_at ?? "").localeCompare(b.last_used_at ?? ""))[0];
      if (!n) break;                                     // every number has reached today's limit
      try {
        await evoSend(n.instance, m.to_phone, m.body);
        await supabase.from("messages").update({ status: "sent", sent_at: new Date().toISOString(), error: null, via_number: n.id }).eq("id", m.id);
        sent++;
        n.sent_today++; n.last_used_at = new Date().toISOString();
        await supabase.from("wa_numbers").update({ sent_today: n.sent_today, sent_on: today, last_used_at: n.last_used_at, last_error: null }).eq("id", n.id);
      } catch (e) {
        const msg = (e as Error).message.slice(0, 300);
        await supabase.from("messages").update({ status: "failed", error: msg }).eq("id", m.id);
        failed++;
        if (/close|not connected|logged out|banned|401|404/i.test(msg)) {
          await supabase.from("wa_numbers").update({ status: /banned/i.test(msg) ? "banned" : "disconnected", last_error: msg }).eq("id", n.id);
          qr.splice(qr.indexOf(n), 1);
          if (!qr.length) break;
        }
      }
      await new Promise((r) => setTimeout(r, 2500 + Math.random() * 4000));
    }
    let lq = supabase.from("messages").select("id", { count: "exact", head: true }).eq("status", "queued").in("channel", channels);
    if (campusId) lq = lq.eq("campus_id", campusId);
    const { count: left } = await lq;
    return { sent, failed, left: left ?? 0, channels };
  }
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
