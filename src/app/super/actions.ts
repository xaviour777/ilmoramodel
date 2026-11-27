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
  const back = str(f, "back");
  if (error) fail(back || `/super/${id}`, error.message);
  revalidatePath("/super", "layout");
  redirect(back ? `${back}?saved=1` : `/super/${id}?saved=1`);
}

export async function setPassword(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const id = str(f, "school_id");
  const { error } = await supabase.rpc("super_set_password", { p_profile: str(f, "profile_id"), p_password: str(f, "password") });
  if (error) fail(`/super/${id}`, error.message);
  redirect(`/super/${id}?saved=password`);
}

// Premium modules (e.g. WhatsApp automation) per school.
export async function setModule(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const id = str(f, "school_id");
  const { error } = await supabase.rpc("super_set_module", { p_school: id, p_module: str(f, "module"), p_on: str(f, "on") === "1" });
  if (error) fail(`/super/${id}`, error.message);
  revalidatePath(`/super/${id}`);
  redirect(`/super/${id}?saved=1`);
}

// ---- Plans ----
export async function savePlan(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const features: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("f_")) features[k.slice(2)] = String(v).trim() || "no";
  const rs = Number(str(f, "price"));
  const p = { id: str(f, "id") || str(f, "name").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name: str(f, "name"),
    price_paisa: Number.isFinite(rs) && rs >= 0 ? String(Math.round(rs * 100)) : "0", max_students: str(f, "max_students"), max_campuses: str(f, "max_campuses"), features };
  const { error } = await supabase.rpc("super_save_plan", { p });
  if (error) fail("/super/plans", error.message);
  revalidatePath("/super", "layout");
  redirect("/super/plans?saved=1");
}

// ---- Billing ----
export async function createInvoice(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const rs = Number(str(f, "amount"));
  const p = { school_id: str(f, "school_id"), period: str(f, "period"), amount_paisa: String(Math.round((Number.isFinite(rs) ? rs : 0) * 100)), due_on: str(f, "due_on"), notes: str(f, "notes") };
  const { error } = await supabase.rpc("super_create_invoice", { p });
  if (error) fail("/super/billing", error.message);
  revalidatePath("/super", "layout");
  redirect("/super/billing?saved=1");
}

export async function billMonth(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("super_bill_month", { p_period: str(f, "period"), p_due: str(f, "due_on") });
  if (error) fail("/super/billing", error.message);
  revalidatePath("/super", "layout");
  redirect(`/super/billing?saved=billed-${data ?? 0}`);
}

export async function setInvoice(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const p: Record<string, string> = { status: str(f, "status") };
  for (const k of ["method", "reference", "paid_on"]) if (f.has(k)) p[k] = str(f, k);
  const { error } = await supabase.rpc("super_set_invoice", { p_id: str(f, "invoice_id"), p });
  const back = str(f, "back") || "/super/billing";
  if (error) fail(back, error.message);
  revalidatePath("/super", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=1`);
}

// ---- Announcements ----
export async function saveAnnouncement(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const p = Object.fromEntries(["title", "body", "tone", "audience", "audience_value", "starts_on", "ends_on"].map((k) => [k, str(f, k)]));
  const { error } = await supabase.rpc("super_save_announcement", { p });
  if (error) fail("/super/announcements", error.message);
  revalidatePath("/", "layout");
  redirect("/super/announcements?saved=1");
}

export async function endAnnouncement(f: FormData) {
  await requireSuper();
  const supabase = await createClient();
  const { error } = await supabase.rpc("super_end_announcement", { p_id: str(f, "id") });
  if (error) fail("/super/announcements", error.message);
  revalidatePath("/", "layout");
  redirect("/super/announcements?saved=ended");
}

// ---- Logins ----
// A fresh password the super admin can read out on the phone: two words of letters and digits.
function tempPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyz", num = "23456789";
  const pick = (set: string, n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => set[x % set.length]).join("");
  return `${pick(abc, 4)}-${pick(num, 4)}`;
}

export type ResetState = { ok?: boolean; error?: string; login?: string; password?: string; name?: string } | null;

// Shown once on screen; nothing stores it.
export async function resetLogin(_prev: ResetState, f: FormData): Promise<ResetState> {
  await requireSuper();
  const supabase = await createClient();
  const password = tempPassword();
  const { data, error } = await supabase.rpc("super_set_password", { p_profile: str(f, "profile_id"), p_password: password });
  if (error) return { error: error.message };
  revalidatePath(`/super/${str(f, "school_id")}/logins`);
  return { ok: true, login: String(data ?? ""), password, name: str(f, "name") };
}
