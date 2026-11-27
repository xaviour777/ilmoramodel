"use server";

import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";

export async function savePushDevice(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await getMe();
  const sb = await createClient();
  const { error } = await sb.from("push_subscriptions").upsert({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: "endpoint" });
  return { error: error?.message ?? null };
}
