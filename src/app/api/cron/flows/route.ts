import { NextResponse } from "next/server";
import { createClient as createService } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { runFlows } from "@/lib/flows";
import { deliverQueued } from "@/lib/deliver";

// Runs every school's WhatsApp flows and sends what is waiting. Vercel calls it daily; an outside
// scheduler (e.g. cron-job.org, free) can call it every 5–10 minutes so messages go out through the day.
// Needs CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY.
export const maxDuration = 60;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = req.headers.get("authorization") ?? `Bearer ${new URL(req.url).searchParams.get("key") ?? ""}`;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!key) return NextResponse.json({ error: "service key missing" }, { status: 500 });
  const sb = createService(SUPABASE_URL, key, { auth: { persistSession: false } });
  const { data: camps } = await sb.from("campuses").select("id, name, schools!inner(modules, status)").contains("schools.modules", ["whatsapp"]);
  const out = [];
  const started = Date.now();
  for (const c of camps ?? []) {
    if ((c.schools as unknown as { status: string }).status === "suspended") continue;
    const r = await runFlows(sb, c.id, c.name);
    const d = Date.now() - started < 40000 ? await deliverQueued(sb, 40, c.id) : { sent: 0, left: -1 };
    out.push({ campus: c.name, ...r, sent: d.sent, left: d.left });
  }
  return NextResponse.json({ ok: true, out });
}
