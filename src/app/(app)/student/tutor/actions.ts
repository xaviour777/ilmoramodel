"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { getLearningAi } from "@/lib/ai";
import {
  DAILY_MESSAGE_LIMIT,
  detectIntent,
  isStudyMessage,
  mathPractice,
  messagesToday,
  nextTutorStage,
  redactPersonalData,
  scorePractice,
  topicFromHomework,
  type TutorLanguage,
  type TutorMessage,
} from "@/lib/tutor/tutor";
import { loadSession, myKids, sessionsFor, tutorToday } from "@/lib/tutor/data";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const page = (studentId: string, sessionId?: string, extra = "") =>
  `/student/tutor?child=${studentId}${sessionId ? `&session=${sessionId}` : ""}${extra}`;

async function requireFamily() {
  const me = await getMe();
  if (me.role !== "student" && me.role !== "parent") redirect("/");
  return me;
}

async function save(sessionId: string, studentId: string, patch: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } = await supabase.from("tutor_sessions").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) redirect(page(studentId, sessionId, `&error=${encodeURIComponent(error.message)}`));
  revalidatePath("/student/tutor");
  redirect(page(studentId, sessionId));
}

/** "Samjhao" on a homework task: opens (or reopens) its tutor session with a first hint. */
export async function startTutor(formData: FormData) {
  const me = await requireFamily();
  const supabase = await createClient();
  const studentId = str(formData, "student_id");
  const homeworkId = str(formData, "homework_id");
  const language = (str(formData, "language") === "ENGLISH" ? "ENGLISH" : "ROMAN_URDU") as TutorLanguage;
  const kid = (await myKids(me)).find((k) => k.id === studentId);
  if (!kid) redirect("/student/tutor");

  const { data: existing } = await supabase.from("tutor_sessions").select("id").eq("student_id", kid.id).eq("homework_id", homeworkId).maybeSingle();
  if (existing) redirect(page(kid.id, existing.id));

  const { data: hw } = await supabase
    .from("homework")
    .select("id, title, instructions, section_id, subjects(name)")
    .eq("id", homeworkId)
    .eq("section_id", kid.section_id ?? "")
    .maybeSingle();
  if (!hw) redirect(page(kid.id, undefined, `&error=${encodeURIComponent("Homework not found for this class.")}`));

  const content = [hw.title, hw.instructions].filter(Boolean).join(". ");
  const subject = (hw.subjects as unknown as { name: string } | null)?.name ?? "General";
  const question = redactPersonalData((str(formData, "question") || content).slice(0, 600));
  const reply = await getLearningAi().tutorReply({
    stage: "HINT",
    subject,
    classLevel: kid.sections?.classes.name ?? "school",
    homework: content,
    question,
    language,
    history: [],
  });
  const { data: created, error } = await supabase
    .from("tutor_sessions")
    .insert({
      campus_id: kid.campus_id,
      student_id: kid.id,
      homework_id: hw.id,
      subject_name: subject,
      topic: topicFromHomework(content),
      question,
      language,
      messages: [{ role: "tutor", text: reply, stage: "HINT", at: new Date().toISOString() }],
    })
    .select("id")
    .single();
  if (error || !created) redirect(page(kid.id, undefined, `&error=${encodeURIComponent(error?.message ?? "Could not start the tutor.")}`));
  revalidatePath("/student/tutor");
  redirect(page(kid.id, created.id));
}

/** The student's next message: hint, then a step, and the full method only after two tries. */
export async function sendTutorMessage(formData: FormData) {
  await requireFamily();
  const s = await loadSession(str(formData, "session_id"));
  if (!s) redirect("/student/tutor");
  const text = redactPersonalData(str(formData, "text")).slice(0, 800);
  if (!text) redirect(page(s.student_id, s.id));

  const all = await sessionsFor(s.student_id, 2);
  if (messagesToday(all, tutorToday()) >= DAILY_MESSAGE_LIMIT) {
    redirect(page(s.student_id, s.id, `&error=${encodeURIComponent("Aaj ki tutor limit poori ho gayi. Kal phir koshish karein.")}`));
  }

  const ur = s.language === "ROMAN_URDU";
  const now = new Date().toISOString();
  const messages: TutorMessage[] = [...s.messages, { role: "student", text, at: now }];

  if (!isStudyMessage(text)) {
    messages.push({ role: "tutor", text: ur ? "Main sirf parhai mein madad karta hoon. Chalo homework par wapas aate hain." : "I only help with school work. Let's get back to the homework.", stage: s.stage, at: now });
    return save(s.id, s.student_id, { messages });
  }

  const next = nextTutorStage({ stage: s.stage, attempts: s.attempts }, detectIntent(text));
  if (next.stage === "PRACTICE") {
    const practice = /math|riyazi|ریاضی/i.test(s.subject_name) ? mathPractice(s.student_id.charCodeAt(0) + s.topic.length, s.topic) : [];
    if (practice.length === 0) {
      messages.push({
        role: "tutor",
        text: ur ? "Is subject ke practice sawal abhi nahi hain. Apni copy mein jawab likh kar teacher ko dikhao. Shabash!" : "There are no practice questions for this subject yet. Write the answer in your notebook and show your teacher. Well done!",
        stage: "DONE",
        at: now,
      });
      return save(s.id, s.student_id, { stage: "DONE", attempts: next.attempts, messages });
    }
    messages.push({ role: "tutor", text: ur ? "Shabash! Ab ye 5 chhote sawal karo." : "Well done! Now try these 5 short questions.", stage: "PRACTICE", at: now });
    return save(s.id, s.student_id, { stage: "PRACTICE", attempts: next.attempts, messages, practice });
  }

  const reply = await getLearningAi().tutorReply({
    stage: next.stage,
    subject: s.subject_name,
    classLevel: "school",
    homework: s.question,
    question: s.question,
    language: s.language,
    history: messages.slice(-12),
  });
  messages.push({ role: "tutor", text: reply, stage: next.stage, at: new Date().toISOString() });
  // Stuck = needed the full answer, so the teacher sees this topic in the class report.
  return save(s.id, s.student_id, { stage: next.stage, attempts: next.attempts, messages, is_stuck: s.is_stuck || next.stage === "ANSWER" });
}

export async function submitPractice(formData: FormData) {
  await requireFamily();
  const s = await loadSession(str(formData, "session_id"));
  if (!s) redirect("/student/tutor");
  if (s.stage !== "PRACTICE" || !s.practice?.length) redirect(page(s.student_id, s.id));
  const answers = Object.fromEntries(s.practice.map((p) => [p.id, str(formData, `p_${p.id}`)]));
  const result = scorePractice(s.practice, answers);
  const ur = s.language === "ROMAN_URDU";
  const wrong = result.results.filter((r) => !r.isCorrect);
  const messages: TutorMessage[] = [...s.messages, {
    role: "tutor",
    text: wrong.length === 0
      ? ur ? `Zabardast! ${result.score}/${result.total}. Ye topic pakka ho gaya.` : `Excellent! ${result.score}/${result.total}. You have got this topic.`
      : (ur ? `${result.score}/${result.total}. In par dobara nazar daalo:\n` : `${result.score}/${result.total}. Look again at these:\n`) + wrong.map((w) => `• ${w.explanation}`).join("\n"),
    stage: "DONE",
    at: new Date().toISOString(),
  }];
  return save(s.id, s.student_id, { stage: "DONE", practice_score: result.score, messages, is_stuck: s.is_stuck || result.score < Math.ceil(result.total / 2) });
}
