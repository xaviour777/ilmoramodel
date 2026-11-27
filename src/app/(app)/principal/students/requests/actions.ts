"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const PATH = "/principal/students/requests";

export async function approveSignup(f: FormData) {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("signup_approve", { p_request: str(f, "request_id"), p_student: str(f, "student_id") || null });
  if (error) redirect(`${PATH}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=${encodeURIComponent(String(data ?? ""))}`);
}

export async function rejectSignup(f: FormData) {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.rpc("signup_reject", { p_request: str(f, "request_id"), p_note: str(f, "note") });
  if (error) redirect(`${PATH}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=rejected`);
}
