"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (error?: string, ok?: string): never => {
  revalidatePath("/teacher/requests");
  redirect(`/teacher/requests${error ? `?error=${encodeURIComponent(error)}` : ok ? `?saved=${ok}` : ""}`);
};

export async function decideLeave(f: FormData) {
  await requireRole("teacher", "principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_student_leave", { p_id: str(f, "leave_id"), p_status: str(f, "status") });
  back(error?.message, "decided");
}

// Open meeting times: a day, a start and end time, and the length of each meeting.
export async function openSlots(f: FormData) {
  const me = await requireRole("teacher", "principal", "owner");
  const supabase = await createClient();
  const day = str(f, "day"), from = str(f, "from"), to = str(f, "to");
  const len = Math.min(60, Math.max(5, Number(str(f, "minutes")) || 10));
  if (!day || !from || !to || to <= from) back("Choose the day and a start before the end time.");
  const rows = [];
  for (let t = Date.parse(`${day}T${from}:00+05:00`); t + len * 60000 <= Date.parse(`${day}T${to}:00+05:00`); t += len * 60000)
    rows.push({ campus_id: me.campus_id, teacher_id: me.id, starts_at: new Date(t).toISOString(), minutes: len, place: str(f, "place") || null });
  if (!rows.length) back("No time fits between those times.");
  const { error } = await supabase.from("ptm_slots").upsert(rows, { onConflict: "teacher_id,starts_at", ignoreDuplicates: true });
  back(error?.message, `slots-${rows.length}`);
}

export async function removeSlot(f: FormData) {
  await requireRole("teacher", "principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.from("ptm_slots").delete().eq("id", str(f, "slot_id")).is("student_id", null);
  back(error?.message, "removed");
}
