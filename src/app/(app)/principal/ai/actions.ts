"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { AI_FEATURES } from "@/lib/ai-features";

// Turn one AI feature on or off for the campus.
export async function toggleAiFeature(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const id = String(f.get("feature") ?? "");
  if (!AI_FEATURES.some((x) => x.id === id)) redirect("/principal/ai");
  const { data } = await supabase.from("campus_settings").select("ai_features").maybeSingle();
  const cur = (data?.ai_features ?? {}) as Record<string, boolean>;
  const next = { ...cur, [id]: f.get("on") === "1" };
  const { error } = await supabase.from("campus_settings").upsert({ campus_id: me.campus_id, ai_features: next }, { onConflict: "campus_id" });
  revalidatePath("/principal/ai");
  redirect(`/principal/ai?sel=${id}${String(f.get("cat") ?? "") ? `&cat=${encodeURIComponent(String(f.get("cat")))}` : ""}${error ? `&error=${encodeURIComponent(error.message)}` : ""}`);
}
