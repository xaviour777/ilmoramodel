"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
// only go back to our own pages
const back = (f: FormData) => { const b = str(f, "back"); return b.startsWith("/") && !b.startsWith("//") ? b : "/"; };
const go = (f: FormData, error?: string | null, ok?: string): never => {
  ["/student", "/parent", "/teacher/class"].forEach((p) => revalidatePath(p, "layout"));
  const b = back(f).replace(/[?&](saved|error)=[^&]*/g, "");
  const sep = b.includes("?") ? "&" : "?";
  redirect(`${b}${error ? `${sep}error=${encodeURIComponent(error)}` : ok ? `${sep}saved=${ok}` : ""}`);
};

const KINDS_FAMILY = ["milestone", "project", "skill", "creative", "reflection"];
const KINDS_ALL = [...KINDS_FAMILY, "achievement", "certificate"];

// Add to the Model Passport. Families' items wait for a teacher; a teacher's are approved at once.
export async function addPassportItem(f: FormData) {
  const me = await requireRole("student", "parent", "teacher", "principal", "owner");
  const family = me.role === "student" || me.role === "parent";
  const kind = str(f, "kind");
  if (!(family ? KINDS_FAMILY : KINDS_ALL).includes(kind)) go(f, "Choose what kind of entry this is.");
  const title = str(f, "title");
  if (title.length < 2) go(f, "Write a short title.");
  const link = str(f, "link_url");
  if (link && !link.startsWith("https://")) go(f, "A link must start with https://");
  const supabase = await createClient();
  const { error } = await supabase.from("passport_items").insert({
    student_id: str(f, "student_id"), kind, title: title.slice(0, 160), body: str(f, "body").slice(0, 2000) || null,
    subject_id: str(f, "subject_id") || null, happened_on: str(f, "happened_on") || undefined, link_url: link || null,
    status: family ? "pending" : "approved", campus_id: me.campus_id,
  });
  go(f, error?.message, family ? "sent" : "added");
}

export async function deletePassportItem(f: FormData) {
  await requireRole("student", "parent", "teacher", "principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.from("passport_items").delete().eq("id", str(f, "id"));
  go(f, error?.message, "removed");
}

// Teacher approves or sends back a family's entry, with an optional note.
export async function decidePassportItem(f: FormData) {
  await requireRole("teacher", "principal", "owner");
  const status = str(f, "status");
  if (!["approved", "rejected"].includes(status)) go(f, "Choose approve or send back.");
  const supabase = await createClient();
  const { error } = await supabase.from("passport_items").update({ status, teacher_note: str(f, "teacher_note") || null }).eq("id", str(f, "id"));
  go(f, error?.message, status);
}

export async function addGoal(f: FormData) {
  const me = await requireRole("student", "parent", "teacher", "principal", "owner");
  const goal = str(f, "goal");
  if (goal.length < 3) go(f, "Write the goal in a few words.");
  const supabase = await createClient();
  const { error } = await supabase.from("learning_goals").insert({
    student_id: str(f, "student_id"), goal: goal.slice(0, 200), subject_id: str(f, "subject_id") || null,
    target_on: str(f, "target_on") || null, campus_id: me.campus_id,
  });
  go(f, error?.message, "goal");
}

export async function setGoalStatus(f: FormData) {
  await requireRole("student", "parent", "teacher", "principal", "owner");
  const status = str(f, "status");
  if (!["active", "done", "dropped"].includes(status)) go(f, "Unknown choice.");
  const supabase = await createClient();
  const { error } = await supabase.from("learning_goals").update({ status }).eq("id", str(f, "id"));
  go(f, error?.message, status === "done" ? "goal-done" : "saved");
}

// Guardian consent for the public link.
export async function setPassportShare(f: FormData) {
  await requireRole("parent");
  const supabase = await createClient();
  const { error } = await supabase.rpc("passport_share", { p_student: str(f, "student_id"), p_on: str(f, "on") === "1", p_new_code: str(f, "new_code") === "1" });
  go(f, error?.message, str(f, "on") === "1" ? "share-on" : "share-off");
}

export async function setItemPublic(f: FormData) {
  await requireRole("parent");
  const supabase = await createClient();
  const { error } = await supabase.rpc("passport_item_public", { p_item: str(f, "id"), p_on: str(f, "on") === "1" });
  go(f, error?.message, "saved");
}

// Teachers' rules for "What should I practise today?"
export async function addPracticeRule(f: FormData) {
  await requireRole("teacher", "principal", "owner");
  const action = str(f, "action");
  const below = Number(str(f, "below_percent") || 60);
  if (action.length < 3) go(f, "Write what the child should practise.");
  if (!(below >= 1 && below <= 100)) go(f, "The mark must be between 1 and 100.");
  const supabase = await createClient();
  const { error } = await supabase.from("practice_rules").insert({
    class_id: str(f, "class_id") || null, subject_id: str(f, "subject_id") || null, below_percent: Math.round(below),
    chapter: str(f, "chapter") || null, action: action.slice(0, 300),
  });
  go(f, error?.message, "rule");
}

export async function toggleRule(f: FormData) {
  await requireRole("teacher", "principal", "owner");
  const supabase = await createClient();
  const { error } = str(f, "delete") === "1"
    ? await supabase.from("practice_rules").delete().eq("id", str(f, "id"))
    : await supabase.from("practice_rules").update({ is_active: str(f, "on") === "1" }).eq("id", str(f, "id"));
  go(f, error?.message, "saved");
}
