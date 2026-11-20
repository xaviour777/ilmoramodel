"use server";

import { pushTo } from "@/lib/push";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => (str(f, k) ? Number(str(f, k)) : null);
const go = (tab: string, error?: string): never => {
  revalidatePath("/principal/care");
  redirect(`/principal/care?tab=${tab}${error ? `&error=${encodeURIComponent(error)}` : "&saved=1"}`);
};

export async function replyFeedback(f: FormData) {
  await requireRole("principal", "owner");
  const sb = await createClient();
  const reply = str(f, "reply");
  const { data: row, error } = await sb.from("feedback").update({ status: str(f, "status") || "in_progress", ...(reply ? { reply, replied_at: new Date().toISOString() } : {}) }).eq("id", str(f, "id")).select("from_profile").maybeSingle();
  if (!error && reply && row?.from_profile) await pushTo({ profiles: [row.from_profile] }, { title: "The school replied", body: reply, url: "/feedback" });
  go("feedback", error?.message);
}

export async function addObservation(f: FormData) {
  await requireRole("principal", "owner");
  const sb = await createClient();
  const { error } = await sb.from("observations").insert({
    teacher_id: str(f, "teacher_id"), section_id: str(f, "section_id") || null, observed_on: str(f, "observed_on") || undefined,
    planning: num(f, "planning"), delivery: num(f, "delivery"), engagement: num(f, "engagement"), discipline: num(f, "discipline"),
    strengths: str(f, "strengths") || null, improve: str(f, "improve") || null,
  });
  go("observe", error?.message);
}

export async function saveBrief(f: FormData) {
  const me = await requireRole("principal", "owner");
  const sb = await createClient();
  const { error } = await sb.from("campus_settings").update({ brief_phone: str(f, "brief_phone") || null, brief_enabled: f.get("brief_enabled") === "on" }).eq("campus_id", me.campus_id);
  go("brief", error?.message);
}
