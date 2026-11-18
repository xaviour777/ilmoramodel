"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

export type PracticeQ = { id: string; question: string; options: string[] };

export async function startPractice(studentId: string, subjectId: string, chapter: string) {
  await requireRole("parent", "student");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("practice_set", { p_student: studentId, p_subject: subjectId, p_chapter: chapter, p_n: 10 });
  return { questions: (data ?? []) as PracticeQ[], error: error?.message ?? null };
}

export async function finishPractice(studentId: string, subjectId: string, chapter: string, answers: Record<string, string>) {
  await requireRole("parent", "student");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("practice_submit", { p_student: studentId, p_subject: subjectId, p_chapter: chapter, p_answers: answers });
  return { result: data as { total: number; correct: number; details: { id: string; given: string | null; answer: string; ok: boolean }[] } | null, error: error?.message ?? null };
}
