"use server";

import { pushTo } from "@/lib/push";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => (str(f, k) ? Number(str(f, k)) : null);
// observations live under Staff & pay and the brief under Messages; the rest on this page
const PAGE: Record<string, string> = { observe: "/principal/staff/observe", brief: "/whatsapp/brief" };
const go = (tab: string, error?: string): never => {
  const page = tab === "transport" ? "/principal/transport" : PAGE[tab];
  revalidatePath(page ?? "/principal/care");
  const q = error ? `error=${encodeURIComponent(error)}` : "saved=1";
  redirect(page ? `${page}?${q}` : `/principal/care?tab=${tab}&${q}`);
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

export async function saveVan(f: FormData) {
  await requireRole("principal", "owner");
  const sb = await createClient();
  const row = { name: str(f, "name"), plate: str(f, "plate") || null, driver_name: str(f, "driver_name") || null, driver_phone: str(f, "driver_phone") || null, route: str(f, "route") || null, seats: num(f, "seats"), monthly_fee_paisa: Math.round((num(f, "fee") ?? 0) * 100) };
  const id = str(f, "id");
  const { error } = id ? await sb.from("vans").update(row).eq("id", id) : await sb.from("vans").insert(row);
  go("transport", error?.message);
}

export async function assignVan(f: FormData) {
  await requireRole("principal", "owner");
  const sb = await createClient();
  const van = str(f, "van_id"), sid = str(f, "student_id");
  const { error } = van ? await sb.from("van_students").upsert({ van_id: van, student_id: sid, stop: str(f, "stop") || null }) : await sb.from("van_students").delete().eq("student_id", sid);
  go("transport", error?.message);
}

export async function markTrip(f: FormData) {
  await requireRole("principal", "owner", "accountant", "teacher");
  const sb = await createClient();
  const all = f.getAll("all").map(String), here = new Set(f.getAll("here").map(String));
  const { error } = await sb.from("van_trips").upsert({ van_id: str(f, "van_id"), date: str(f, "date"), leg: str(f, "leg"), missing: all.filter((s) => !here.has(s)) }, { onConflict: "van_id,date,leg" });
  go("transport", error?.message);
}

export async function saveBrief(f: FormData) {
  const me = await requireRole("principal", "owner");
  const sb = await createClient();
  const { error } = await sb.from("campus_settings").update({ brief_phone: str(f, "brief_phone") || null, brief_enabled: f.get("brief_enabled") === "on" }).eq("campus_id", me.campus_id);
  go("brief", error?.message);
}
