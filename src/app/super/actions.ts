"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSuper } from "@/lib/super";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const fail = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);

export async function createSchool(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const p = Object.fromEntries(["name", "city", "campus_name", "custom_domain", "logo_url", "primary_color", "support_email", "trial_days", "plan", "max_students", "notes",
    "principal_name", "principal_email", "principal_phone", "principal_password"].map((k) => [k, str(f, k)]));
  p.custom_domain = p.custom_domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const { data, error } = await supabase.rpc("super_create_school", { p });
  if (error) fail("/super/new", error.message);
  revalidatePath("/super");
  redirect(`/super/${data}?saved=created`);
}

export async function updateSchool(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const id = str(f, "school_id");
  const p: Record<string, string> = {};
  for (const k of ["name", "city", "custom_domain", "logo_url", "primary_color", "support_email", "plan", "max_students", "notes", "trial_ends_on"]) if (f.has(k)) p[k] = str(f, k);
  if (p.custom_domain !== undefined) p.custom_domain = p.custom_domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const { error } = await supabase.rpc("super_update_school", { p_school: id, p });
  if (error) fail(`/super/${id}`, error.message);
  revalidatePath(`/super/${id}`);
  redirect(`/super/${id}?saved=1`);
}

// Activate, suspend, or start / extend a trial.
export async function setStatus(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const id = str(f, "school_id");
  const status = str(f, "status");
  const days = Number(str(f, "days")) || 0;
  const p: Record<string, string> = { status, _action: str(f, "label") || `status: ${status}` };
  if (status === "trial") {
    const base = str(f, "from") && str(f, "from") > new Date().toISOString().slice(0, 10) ? str(f, "from") : new Date().toISOString().slice(0, 10);
    p.trial_ends_on = new Date(Date.parse(base) + days * 86400000).toISOString().slice(0, 10);
  }
  const { error } = await supabase.rpc("super_update_school", { p_school: id, p });
  if (error) fail(`/super/${id}`, error.message);
  revalidatePath("/super");
  redirect(`/super/${id}?saved=1`);
}

export async function setPassword(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const id = str(f, "school_id");
  const { error } = await supabase.rpc("super_set_password", { p_profile: str(f, "profile_id"), p_password: str(f, "password") });
  if (error) fail(`/super/${id}`, error.message);
  redirect(`/super/${id}?saved=password`);
}
