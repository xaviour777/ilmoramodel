"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (error?: string, ok?: string): never => {
  revalidatePath("/parent/requests");
  redirect(`/parent/requests${error ? `?error=${encodeURIComponent(error)}` : ok ? `?saved=${ok}` : ""}`);
};

export async function askLeave(f: FormData) {
  await requireRole("parent", "student");
  const supabase = await createClient();
  const from = str(f, "from_on"), to = str(f, "to_on") || from;
  if (!str(f, "reason")) back("Write the reason.");
  const { error } = await supabase.from("student_leave").insert({ student_id: str(f, "student_id"), from_on: from, to_on: to, reason: str(f, "reason") });
  back(error?.message, "leave");
}

export async function bookMeeting(f: FormData) {
  await requireRole("parent");
  const supabase = await createClient();
  const { error } = await supabase.rpc("book_ptm", { p_slot: str(f, "slot_id"), p_student: str(f, "student_id"), p_note: str(f, "note") });
  back(error?.message, "booked");
}

export async function cancelMeeting(f: FormData) {
  await requireRole("parent");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_ptm", { p_slot: str(f, "slot_id") });
  back(error?.message, "cancelled");
}
