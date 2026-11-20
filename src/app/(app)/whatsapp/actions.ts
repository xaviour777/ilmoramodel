"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { evoCreate, evoPhone, evoQr, evoReady, evoRemove, evoState } from "@/lib/evolution";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, error?: string): never => { revalidatePath("/whatsapp", "layout"); redirect(path + (error ? `?error=${encodeURIComponent(error)}` : "?saved=1")); };

async function gate() {
  const me = await requireRole("principal", "owner");
  const sb = await createClient();
  const { data: on } = await sb.rpc("has_module", { p_module: "whatsapp" });
  if (!on) back("/whatsapp", "The WhatsApp module isn't switched on for this school.");
  return { me, sb };
}

export async function addNumber(f: FormData) {
  const { me, sb } = await gate();
  if (!evoReady()) back("/whatsapp", "The WhatsApp server isn't set up yet (EVOLUTION_URL and EVOLUTION_KEY).");
  const instance = `ilm-${me.campus_id.slice(0, 8)}-${Date.now().toString(36)}`;
  try { await evoCreate(instance); } catch (e) { back("/whatsapp", (e as Error).message); }
  const { error } = await sb.from("wa_numbers").insert({ label: str(f, "label") || "School number", instance, status: "qr", daily_limit: Number(str(f, "limit")) || 150 });
  back("/whatsapp", error?.message);
}

// Polled by the QR card every few seconds until the phone has scanned it.
export async function qrStatus(id: string) {
  const { sb } = await gate();
  const { data: n } = await sb.from("wa_numbers").select("instance, status").eq("id", id).maybeSingle();
  if (!n) return { state: "gone" as const, qr: null };
  try {
    const st = await evoState(n.instance);
    if (st === "open") {
      const phone = await evoPhone(n.instance);
      await sb.from("wa_numbers").update({ status: "connected", phone, last_error: null }).eq("id", id);
      return { state: "connected" as const, qr: null };
    }
    return { state: "qr" as const, qr: await evoQr(n.instance) };
  } catch (e) { return { state: "error" as const, qr: null, error: (e as Error).message }; }
}

export async function relink(f: FormData) {
  const { sb } = await gate();
  await sb.from("wa_numbers").update({ status: "qr" }).eq("id", str(f, "id"));
  back("/whatsapp");
}

export async function refreshNumbers() {
  const { sb } = await gate();
  if (!evoReady()) back("/whatsapp", "The WhatsApp server isn't set up yet.");
  const { data } = await sb.from("wa_numbers").select("id, instance, status").neq("status", "banned");
  for (const n of data ?? []) {
    const st = await evoState(n.instance).catch(() => "close");
    const status = st === "open" ? "connected" : n.status === "qr" ? "qr" : "disconnected";
    if (status !== n.status) await sb.from("wa_numbers").update({ status }).eq("id", n.id);
  }
  back("/whatsapp");
}

export async function saveNumber(f: FormData) {
  const { sb } = await gate();
  const { error } = await sb.from("wa_numbers").update({ label: str(f, "label"), daily_limit: Math.max(1, Math.min(1000, Number(str(f, "limit")) || 150)) }).eq("id", str(f, "id"));
  back("/whatsapp", error?.message);
}

export async function removeNumber(f: FormData) {
  const { sb } = await gate();
  const { data: n } = await sb.from("wa_numbers").select("instance").eq("id", str(f, "id")).maybeSingle();
  if (n && evoReady()) await evoRemove(n.instance);
  const { error } = await sb.from("wa_numbers").delete().eq("id", str(f, "id"));
  back("/whatsapp", error?.message);
}
