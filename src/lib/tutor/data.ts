import { createClient } from "@/lib/supabase/server";
import { todayPK } from "@/lib/format";
import type { PracticeItem, TutorLanguage, TutorMessage, TutorStage } from "./tutor";

// Tutor sessions, read and written as the signed-in student or parent (row-level security
// keeps each family to its own children).

export type Kid = { id: string; full_name: string; campus_id: string; section_id: string | null; sections: { name: string; classes: { name: string } } | null };

export type TutorSession = {
  id: string;
  student_id: string;
  homework_id: string | null;
  subject_name: string;
  topic: string;
  question: string;
  language: TutorLanguage;
  stage: TutorStage;
  attempts: number;
  messages: TutorMessage[];
  practice: PracticeItem[] | null;
  practice_score: number | null;
  is_stuck: boolean;
  created_at: string;
};

export const SESSION_COLS =
  "id, student_id, homework_id, subject_name, topic, question, language, stage, attempts, messages, practice, practice_score, is_stuck, created_at";

/** The children this person may use the tutor for: themselves as a student, or their own children as a parent. */
export async function myKids(me: { id: string; role: string }): Promise<Kid[]> {
  const supabase = await createClient();
  let q = supabase.from("students").select("id, full_name, campus_id, section_id, sections(name, classes(name))").eq("status", "enrolled");
  if (me.role === "student") q = q.eq("profile_id", me.id);
  const { data } = await q.order("full_name");
  return (data ?? []) as unknown as Kid[];
}

export async function loadSession(id: string): Promise<TutorSession | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tutor_sessions").select(SESSION_COLS).eq("id", id).maybeSingle();
  return (data as unknown as TutorSession) ?? null;
}

export async function sessionsFor(studentId: string, sinceDays?: number): Promise<TutorSession[]> {
  const supabase = await createClient();
  let q = supabase.from("tutor_sessions").select(SESSION_COLS).eq("student_id", studentId);
  if (sinceDays) q = q.gte("created_at", new Date(Date.now() - sinceDays * 86400_000).toISOString());
  const { data } = await q.order("updated_at", { ascending: false }).limit(50);
  return (data ?? []) as unknown as TutorSession[];
}

/** Pakistan date, so "today" matches the school day for the daily message limit. */
export const tutorToday = () => todayPK();
