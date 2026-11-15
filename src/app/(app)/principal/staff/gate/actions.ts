"use server";

import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { BADGE_PREFIX } from "@/lib/badge";

export type GateResult =
  | { ok: true; action: "in" | "out" | "already"; name: string; status: string; at: string; in_at?: string; out_at?: string | null }
  | { ok: false; error: string };

// Checks a staff member in or out from the QR on their card or phone.
export async function scanBadge(raw: string): Promise<GateResult> {
  await requireRole("principal", "owner", "accountant");
  const token = raw.trim().startsWith(BADGE_PREFIX) ? raw.trim().slice(BADGE_PREFIX.length) : raw.trim();
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, error: "This is not an Ilmora staff card." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gate_scan", { p_token: token });
  if (error) return { ok: false, error: error.message };
  return data as GateResult;
}
