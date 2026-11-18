import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

// Phone alerts. Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in the server env;
// without them nothing is sent and nothing fails.
export const pushReady = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export async function pushTo(to: { profiles?: string[]; students?: string[]; sections?: string[] }, msg: { title: string; body: string; url?: string }) {
  if (!pushReady()) return 0;
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("push_targets", { p_profiles: to.profiles ?? [], p_students: to.students ?? [], p_sections: to.sections ?? [] });
    if (!data?.length) return 0;
    webpush.setVapidDetails("mailto:support@ilmora.pk", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    const payload = JSON.stringify({ title: msg.title, body: msg.body.slice(0, 300), url: msg.url ?? "/" });
    const res = await Promise.allSettled((data as { endpoint: string; p256dh: string; auth: string }[]).map((d) =>
      webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 86400 }).catch(async (e: { statusCode?: number }) => {
        if (e.statusCode === 404 || e.statusCode === 410) await sb.rpc("push_forget", { p_endpoint: d.endpoint });
        throw e;
      })));
    return res.filter((r) => r.status === "fulfilled").length;
  } catch { return 0; }
}
