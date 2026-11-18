import { NextResponse } from "next/server";
import { createClient as createService } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { buildBrief } from "@/lib/brief";
import { sendOne, type MessagingConfig, SETTINGS_COLS } from "@/lib/deliver";
import { mobilePK } from "@/lib/messages";

// Vercel cron, every morning. Needs CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY in Vercel env.
// Only campuses that turned the brief on, saved a phone and set up WhatsApp/SMS get a message.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!key) return NextResponse.json({ error: "service key missing" }, { status: 500 });
  const sb = createService(SUPABASE_URL, key, { auth: { persistSession: false } });
  const { data: rows } = await sb.from("campus_settings").select(`campus_id, brief_phone, ${SETTINGS_COLS}, campuses(schools(name, status))`).eq("brief_enabled", true);
  const out: { campus: string; ok: boolean; error?: string }[] = [];
  for (const r of (rows ?? []) as unknown as (MessagingConfig & { campus_id: string; brief_phone: string | null; campuses: { schools: { name: string; status: string } } })[]) {
    const to = mobilePK(r.brief_phone);
    if (!to || r.campuses?.schools?.status === "suspended") continue;
    const { data: k } = await sb.from("campus_secrets").select("whatsapp_token, sms_api_key").eq("campus_id", r.campus_id).maybeSingle();
    const cfg = { ...r, whatsapp_token: k?.whatsapp_token ?? null, sms_api_key: k?.sms_api_key ?? null };
    const ch = cfg.whatsapp_enabled && cfg.whatsapp_phone_number_id && cfg.whatsapp_token ? "whatsapp" : cfg.sms_enabled && cfg.sms_url ? "sms" : null;
    if (!ch) { out.push({ campus: r.campus_id, ok: false, error: "no channel" }); continue; }
    try {
      await sendOne(cfg, ch, to, await buildBrief(sb, r.campus_id, r.campuses?.schools?.name ?? "School"));
      out.push({ campus: r.campus_id, ok: true });
    } catch (e) { out.push({ campus: r.campus_id, ok: false, error: e instanceof Error ? e.message : "failed" }); }
  }
  return NextResponse.json({ sent: out.filter((o) => o.ok).length, out });
}
