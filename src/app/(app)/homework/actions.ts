"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

// A family hands in homework: the photo is already in the private bucket; this saves the record.
export async function submitHomework(homeworkId: string, studentId: string, photoPath: string, note: string) {
  await requireRole("parent", "student");
  const supabase = await createClient();
  const { data: st } = await supabase.from("students").select("campus_id").eq("id", studentId).maybeSingle();
  if (!st) return { error: "That child is not on your account." };
  if (!photoPath.startsWith(`${studentId}/`)) return { error: "The photo didn't save. Try again." };
  const { error } = await supabase.from("homework_submissions").upsert({
    campus_id: st.campus_id, homework_id: homeworkId, student_id: studentId, submitted_at: new Date().toISOString(),
    photo_path: photoPath, note: note.trim() || null,
  }, { onConflict: "homework_id,student_id" });
  revalidatePath("/parent"); revalidatePath("/student");
  return { error: error?.message ?? null };
}

// The teacher marks one submission.
export async function checkSubmission(f: FormData) {
  await requireRole("teacher", "principal", "owner");
  const supabase = await createClient();
  const marks = String(f.get("marks") ?? "").trim();
  const { error } = await supabase.from("homework_submissions").update({
    marks: marks === "" ? null : Number(marks), remark: String(f.get("remark") ?? "").trim() || null, checked_at: new Date().toISOString(),
  }).eq("id", String(f.get("submission_id")));
  const back = `/teacher/homework/${String(f.get("homework_id"))}`;
  revalidatePath(back);
  const { redirect } = await import("next/navigation");
  redirect(`${back}${error ? `?error=${encodeURIComponent(error.message)}` : "?saved=1"}`);
}
