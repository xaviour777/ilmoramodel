"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (path: string, error?: string, ok?: string): never => {
  revalidatePath("/teacher/class"); revalidatePath("/teacher/plans");
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${error ? `${sep}error=${encodeURIComponent(error)}` : ok ? `${sep}saved=${ok}` : ""}`);
};

export async function addRemedial(f: FormData) {
  const me = await requireRole("teacher", "principal", "owner");
  const supabase = await createClient();
  const ids = f.getAll("student_id").map(String);
  if (!ids.length) go(str(f, "back"), "Tick at least one student.");
  const { error } = await supabase.from("remedial_students").insert(ids.map((id) => ({
    campus_id: me.campus_id, student_id: id, section_id: str(f, "section_id"), subject_id: str(f, "subject_id") || null,
    reason: str(f, `reason:${id}`) || null, plan: str(f, "plan") || null,
  })));
  go(str(f, "back"), error?.message, `remedial-${ids.length}`);
}

export async function endRemedial(f: FormData) {
  await requireRole("teacher", "principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.from("remedial_students").update({ status: "done", ended_on: new Date().toISOString().slice(0, 10) }).eq("id", str(f, "id"));
  go(str(f, "back"), error?.message, "done");
}

// An app notice to everyone in one section the teacher teaches.
export async function noticeToSection(f: FormData) {
  const me = await requireRole("teacher", "principal", "owner");
  const supabase = await createClient();
  if (!str(f, "title") || !str(f, "body")) go(str(f, "back"), "Write a title and the message.");
  const { error } = await supabase.from("notices").insert({ campus_id: me.campus_id, title: str(f, "title"), body: str(f, "body"), audience: "section", section_id: str(f, "section_id"), created_by: me.id });
  go(str(f, "back"), error?.message, "notice");
}

export async function saveLessonPlan(f: FormData) {
  const me = await requireRole("teacher", "principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.from("lesson_plans").upsert({
    campus_id: me.campus_id, teacher_id: me.id, section_id: str(f, "section_id"), subject_id: str(f, "subject_id"), week_start: str(f, "week_start"),
    topics: str(f, "topics"), objectives: str(f, "objectives") || null, homework: str(f, "homework") || null,
  }, { onConflict: "section_id,subject_id,week_start" });
  go(str(f, "back"), error?.message, "plan");
}
