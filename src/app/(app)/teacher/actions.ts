"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveAttendance(formData: FormData) {
  const me = await getMe();
  const supabase = await createClient();
  const sectionId = str(formData, "section_id");
  const date = str(formData, "date");
  const ids = formData.getAll("student_id").map(String);
  const rows = ids.map((id) => ({
    campus_id: me.campus_id,
    section_id: sectionId,
    student_id: id,
    date,
    status: str(formData, "status_" + id) || "present",
    marked_by: me.id,
    marked_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,date" });
  const q = `?section=${sectionId}&date=${date}`;
  if (error) redirect(`/teacher${q}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/teacher");
  redirect(`/teacher${q}&saved=1`);
}

export async function createHomework(formData: FormData) {
  const me = await getMe();
  const supabase = await createClient();
  const { error } = await supabase.from("homework").insert({
    campus_id: me.campus_id,
    section_id: str(formData, "section_id"),
    subject_id: str(formData, "subject_id") || null,
    teacher_id: me.id,
    title: str(formData, "title"),
    instructions: str(formData, "instructions") || null,
    due_on: str(formData, "due_on"),
    total_marks: Number(str(formData, "total_marks")) || null,
    notify_parents: formData.get("notify_parents") === "on",
  });
  if (error) redirect(`/teacher/homework?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/teacher/homework");
  redirect("/teacher/homework?saved=1");
}

export async function saveMarks(formData: FormData) {
  const me = await getMe();
  const supabase = await createClient();
  const examId = str(formData, "exam_id");
  const subjectId = str(formData, "subject_id");
  const sectionId = str(formData, "section_id");
  const rows = formData.getAll("student_id").map(String).flatMap((id) => {
    const raw = str(formData, "m_" + id);
    const absent = raw.toUpperCase() === "A";
    if (!raw) return [];
    return [{
      campus_id: me.campus_id, exam_id: examId, subject_id: subjectId, student_id: id,
      obtained: absent ? null : Number(raw), is_absent: absent, entered_by: me.id,
    }];
  });
  const q = `?exam=${examId}&subject=${subjectId}&section=${sectionId}`;
  if (rows.some((r) => r.obtained !== null && Number.isNaN(r.obtained))) {
    redirect(`/teacher/marks${q}&error=${encodeURIComponent("Marks must be numbers, or A for absent.")}`);
  }
  const { error } = await supabase.from("marks").upsert(rows, { onConflict: "exam_id,subject_id,student_id" });
  if (error) redirect(`/teacher/marks${q}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/teacher/marks");
  redirect(`/teacher/marks${q}&saved=1`);
}

export async function addDiary(formData: FormData) {
  const me = await getMe();
  const supabase = await createClient();
  const { error } = await supabase.from("lesson_diary").insert({
    campus_id: me.campus_id, teacher_id: me.id,
    section_id: str(formData, "section_id"), subject_id: str(formData, "subject_id") || null,
    topic: str(formData, "topic"), notes: str(formData, "notes") || null,
  });
  if (error) redirect(`/teacher/diary?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/teacher/diary");
  redirect("/teacher/diary?saved=diary");
}

export async function addBehaviour(formData: FormData) {
  const me = await getMe();
  const supabase = await createClient();
  const { error } = await supabase.from("behaviour_notes").insert({
    campus_id: me.campus_id, teacher_id: me.id,
    student_id: str(formData, "student_id"), kind: str(formData, "kind"),
    note: str(formData, "note"), share_with_parents: formData.get("share") === "on",
  });
  if (error) redirect(`/teacher/diary?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/teacher/diary");
  redirect("/teacher/diary?saved=note");
}

export async function requestLeave(formData: FormData) {
  const me = await getMe();
  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").insert({
    campus_id: me.campus_id, profile_id: me.id,
    from_on: str(formData, "from_on"), to_on: str(formData, "to_on"), reason: str(formData, "reason") || null,
  });
  if (error) redirect(`/teacher/leave?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/teacher/leave");
  redirect("/teacher/leave?saved=1");
}
