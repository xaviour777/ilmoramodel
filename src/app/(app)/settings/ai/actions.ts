"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { modelInfo, providerById } from "@/lib/ai-catalog";
import { callAi } from "@/lib/ai";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (q: string): never => redirect(`/settings/ai?${q}`);
const err = (m: string) => back(`error=${encodeURIComponent(m)}`);
// a blank price box means "use the list price for this model"
const price = (f: FormData, k: string, list: number | undefined) => {
  const v = str(f, k);
  if (!v) return list ?? 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

// Saves which AI company and model to use, its key, prices and the daily limit.
export async function saveAi(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const provider = str(f, "provider");
  const p = providerById(provider);
  if (!p) return err("Choose an AI company.");
  const model = str(f, "model") || p.models[0].id;
  const known = modelInfo(provider, model);
  const priceIn = price(f, "price_in", known?.priceIn);
  const priceOut = price(f, "price_out", known?.priceOut);
  const budget = Number(str(f, "budget"));
  if (Number.isNaN(priceIn) || Number.isNaN(priceOut)) return err("Prices must be numbers, like 0.10.");
  if (!Number.isFinite(budget) || budget < 0 || budget > 1000) return err("Write the daily limit in dollars, like 1 or 0.50.");
  // only models known to read photos get the answer pictures; for others the teacher marks written answers
  const vision = known ? known.vision : f.get("vision") === "on";

  const { error } = await supabase.from("ai_settings").upsert({
    campus_id: me.campus_id, enabled: f.get("enabled") === "on", provider, model,
    price_in_usd: priceIn, price_out_usd: priceOut, vision, daily_budget_usd: budget,
    updated_by: me.id, updated_at: new Date().toISOString(),
  }, { onConflict: "campus_id" });
  if (error) return err(error.message);

  const key = str(f, "api_key");
  if (key) {
    const { error: e2 } = await supabase.from("ai_keys").upsert(
      { campus_id: me.campus_id, provider, api_key: key, updated_at: new Date().toISOString() },
      { onConflict: "campus_id,provider" });
    if (e2) return err(e2.message);
  } else if (f.get("clear_key") === "on") {
    await supabase.from("ai_keys").delete().eq("campus_id", me.campus_id).eq("provider", provider);
  }
  revalidatePath("/settings/ai");
  back("saved=1");
}

// Raises or lowers only the daily limit, from the quick buttons.
export async function setBudget(f: FormData) {
  const me = await requireRole("principal", "owner");
  const budget = Number(str(f, "budget"));
  if (!Number.isFinite(budget) || budget < 0 || budget > 1000) return err("Write the daily limit in dollars.");
  const supabase = await createClient();
  const { error } = await supabase.from("ai_settings").upsert(
    { campus_id: me.campus_id, daily_budget_usd: budget, updated_by: me.id, updated_at: new Date().toISOString() },
    { onConflict: "campus_id" });
  if (error) return err(error.message);
  revalidatePath("/settings/ai");
  back("saved=1");
}

// One tiny call so the principal sees the key and model work. It counts toward today's spend.
export async function testAi() {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const r = await callAi(supabase, {
    feature: "notice", maxTokens: 300,
    messages: [{ role: "user", text: "Reply with one short line in Roman Urdu saying the school's AI is connected." }],
  });
  if (r.ok) back(`tested=${encodeURIComponent(r.text.slice(0, 200))}`);
  const why = !r.ok && r.reason === "off" ? "AI is off, or no key is saved for this company."
    : !r.ok && r.reason === "budget" ? "Today's limit is used up. Raise the limit or wait until tomorrow."
    : `Test failed: ${!r.ok ? r.message ?? r.reason : ""}`;
  err(why);
}
