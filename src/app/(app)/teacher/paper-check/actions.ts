"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMe, requireRole } from "@/lib/me";
import { MAX_MCQ, MAX_WRITTEN, OPTION_LETTERS } from "@/lib/paper-check/layout";
import { scoreMcq, type McqAnswer } from "@/lib/paper-check/omr";
import { decideAnswer, parseRubricLine, validateQuestions, type WrittenAnswer, type WrittenQuestion } from "@/lib/paper-check/rubric";
import { loadSheets, loadTest, maxMarksOf, settleSheet } from "@/lib/paper-check/data";
import { draftQuiz, parseMcqText, type QuizAsk, type QuizDraft } from "@/lib/paper-check/quiz";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const checked = (f: FormData, k: string) => f.get(k) === "on";
const back = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);

export async function createPaperTest(formData: FormData) {
  const me = await getMe();
  const supabase = await createClient();
  const sectionId = str(formData, "section_id");
  const here = `/teacher/paper-check/new?section=${sectionId}`;

  const options = Math.max(2, Math.min(5, Number(str(formData, "options_per_mcq")) || 4));
  const allowed = OPTION_LETTERS.slice(0, options) as readonly string[];
  const key = str(formData, "mcq_key").toUpperCase().replace(/[^A-E]/g, "").split("");
  if (key.length > MAX_MCQ) back(here, `At most ${MAX_MCQ} MCQs fit on one sheet.`);
  const bad = key.findIndex((k) => !allowed.includes(k));
  if (bad >= 0) back(here, `MCQ ${bad + 1}: the answer must be one of ${allowed.join(", ")}.`);

  const questions: WrittenQuestion[] = [];
  for (let i = 1; i <= MAX_WRITTEN; i++) {
    const prompt = str(formData, `q${i}_prompt`);
    if (!prompt) continue;
    const maxMarks = Number(str(formData, `q${i}_marks`));
    const rubricLine = str(formData, `q${i}_rubric`);
    questions.push({
      no: questions.length + 1,
      type: maxMarks > 4 ? "LONG" : "SHORT",
      prompt,
      maxMarks,
      topic: str(formData, `q${i}_topic`) || undefined,
      rubric: rubricLine ? parseRubricLine(rubricLine) : [{ point: "Correct answer", marks: maxMarks }],
    });
  }
  const mcqQuestions = parseMcqText(str(formData, "mcq_questions"));
  if (mcqQuestions.length && mcqQuestions.length !== key.length) {
    back(here, `There are ${mcqQuestions.length} MCQ questions but ${key.length} answers in the key. Make them the same.`);
  }
  const badOptions = mcqQuestions.findIndex((m) => m.options.length !== options);
  if (badOptions >= 0) back(here, `MCQ ${badOptions + 1} needs ${options} options (${allowed.join(", ")}), one per line.`);
  const errors = validateQuestions(questions);
  if (errors.length) back(here, errors.join(" "));
  if (key.length === 0 && questions.length === 0) back(here, "Add MCQ answers or at least one written question.");

  const marksEach = Number(str(formData, "mcq_marks_each")) || 1;
  const examId = str(formData, "exam_id") || null;
  if (examId) {
    const { data: exam } = await supabase.from("exams").select("total_marks").eq("id", examId).maybeSingle();
    const max = maxMarksOf({ mcq_key: key, mcq_marks_each: marksEach, questions });
    if (exam && exam.total_marks !== max) {
      back(here, `This paper is out of ${max} but the exam is out of ${exam.total_marks}. Make them equal, or don't link the exam.`);
    }
  }

  const { data: test, error } = await supabase
    .from("paper_tests")
    .insert({
      campus_id: me.campus_id,
      section_id: sectionId,
      subject_id: str(formData, "subject_id"),
      exam_id: examId,
      title: str(formData, "title"),
      test_date: str(formData, "test_date") || undefined,
      mcq_key: key,
      mcq_marks_each: marksEach,
      options_per_mcq: options,
      questions,
      mcq_questions: mcqQuestions,
      // a quiz that adds no marks to an exam may show its result to families as soon as it is checked
      auto_publish: checked(formData, "auto_publish") && !examId,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error || !test) back(here, error?.message ?? "Could not create the test.");

  const { data: students } = await supabase.from("students").select("id").eq("section_id", sectionId).eq("status", "enrolled");
  if (students?.length) {
    const { error: e2 } = await supabase
      .from("paper_sheets")
      .insert(students.map((s) => ({ campus_id: me.campus_id, test_id: test!.id, student_id: s.id })));
    if (e2) back(`/teacher/paper-check/${test!.id}`, e2.message);
  }
  revalidatePath("/teacher/paper-check");
  redirect(`/teacher/paper-check/${test!.id}`);
}

async function loadForEdit(sheetId: string) {
  const supabase = await createClient();
  const { data: sheet } = await supabase
    .from("paper_sheets")
    .select("id, test_id, mcq_answers, mcq_score, flags, answers, status")
    .eq("id", sheetId)
    .maybeSingle();
  if (!sheet) return null;
  const test = await loadTest(sheet.test_id);
  if (!test) return null;
  return { supabase, sheet, test };
}

async function saveSheet(sheetId: string, patch: Record<string, unknown>, testId: string, anchor: string) {
  const me = await getMe();
  const supabase = await createClient();
  const done = patch.status === "reviewed" || patch.status === "absent";
  const { error } = await supabase
    .from("paper_sheets")
    .update({ ...patch, reviewed_by: done ? me.id : null, reviewed_at: done ? new Date().toISOString() : null })
    .eq("id", sheetId);
  const page = `/teacher/paper-check/${testId}`;
  if (error) back(page, error.message);
  revalidatePath(page);
  redirect(`${page}${anchor}`);
}

/** Teacher's decision on one written answer: accept the AI mark or type their own. */
export async function markAnswer(formData: FormData) {
  const sheetId = str(formData, "sheet_id");
  const no = Number(str(formData, "no"));
  const raw = str(formData, "marks");
  const ctx = await loadForEdit(sheetId);
  if (!ctx) return back("/teacher/paper-check", "Paper not found.");
  const { sheet, test } = ctx;
  const q = test.questions.find((x) => x.no === no);
  if (!q) return back(`/teacher/paper-check/${test.id}`, `Question ${no} not found.`);
  const answers = [...(sheet.answers as WrittenAnswer[])];
  const idx = answers.findIndex((a) => a.no === no);
  let decided;
  try {
    decided = decideAnswer(q, idx >= 0 ? answers[idx] : { no }, raw === "accept" ? "accept" : Number(raw));
  } catch (err) {
    return back(`/teacher/paper-check/${test.id}`, err instanceof Error ? err.message : "Invalid marks");
  }
  if (idx >= 0) answers[idx] = decided;
  else answers.push(decided);
  const settled = settleSheet(test.questions, answers, Number(sheet.mcq_score), sheet.flags as string[]);
  await saveSheet(sheetId, { answers, flags: settled.flags, total: settled.total, status: settled.status }, test.id, "?tab=review");
}

/** Accept every AI mark on one sheet. */
export async function acceptAllAi(formData: FormData) {
  const ctx = await loadForEdit(str(formData, "sheet_id"));
  if (!ctx) return back("/teacher/paper-check", "Paper not found.");
  const { sheet, test } = ctx;
  const answers = (sheet.answers as WrittenAnswer[]).map((a) => {
    const q = test.questions.find((x) => x.no === a.no);
    return !q || a.finalMarks != null || a.ai?.marks == null ? a : decideAnswer(q, a, "accept");
  });
  const settled = settleSheet(test.questions, answers, Number(sheet.mcq_score), sheet.flags as string[]);
  await saveSheet(sheet.id, { answers, flags: settled.flags, total: settled.total, status: settled.status }, test.id, "?tab=review");
}

/** Teacher types the MCQ answers by hand (two bubbles filled or a bad photo). */
export async function fixMcq(formData: FormData) {
  const ctx = await loadForEdit(str(formData, "sheet_id"));
  if (!ctx) return back("/teacher/paper-check", "Paper not found.");
  const { sheet, test } = ctx;
  const allowed = OPTION_LETTERS.slice(0, test.options_per_mcq) as readonly string[];
  const typed = str(formData, "mcq").toUpperCase().replace(/[^A-E-]/g, "").split("");
  const answers: McqAnswer[] = test.mcq_key.map((_, i) => (typed[i] && allowed.includes(typed[i]) ? typed[i] : null));
  const mcq = scoreMcq(test.mcq_key, answers, Number(test.mcq_marks_each));
  const flags = (sheet.flags as string[]).filter((f) => !["DOUBLE_FILLED", "QR_NOT_READ", "BLURRY", "ALL_BLANK"].includes(f));
  const settled = settleSheet(test.questions, sheet.answers as WrittenAnswer[], mcq.score, flags);
  await saveSheet(sheet.id, { mcq_answers: answers, mcq_score: mcq.score, flags: settled.flags, total: settled.total, status: settled.status }, test.id, "?tab=review");
}

/** Student was absent: no marks, left out of the class average. */
export async function markAbsent(formData: FormData) {
  const ctx = await loadForEdit(str(formData, "sheet_id"));
  if (!ctx) return back("/teacher/paper-check", "Paper not found.");
  await saveSheet(ctx.sheet.id, { status: "absent", total: null, flags: [] }, ctx.test.id, "?tab=students");
}

/** Teacher sends the checked test to the principal. The database refuses while any paper is open. */
export async function submitTest(formData: FormData) {
  const supabase = await createClient();
  const id = str(formData, "test_id");
  const { data: t } = await supabase.from("paper_tests").select("auto_publish, exam_id").eq("id", id).maybeSingle();
  // a quick quiz goes straight to students and parents; anything else waits for the principal
  const publish = !!t?.auto_publish && !t.exam_id;
  const { error } = await supabase.from("paper_tests").update({ status: publish ? "approved" : "submitted" }).eq("id", id).eq("status", "checking");
  if (error) back(`/teacher/paper-check/${id}`, error.message);
  revalidatePath(`/teacher/paper-check/${id}`);
  redirect(`/teacher/paper-check/${id}?saved=${publish ? "approved" : "submitted"}`);
}

/** Principal approves: students and parents can now see the result, and a linked exam gets the marks. */
export async function approveTest(formData: FormData) {
  const me = await getMe();
  const supabase = await createClient();
  const id = str(formData, "test_id");
  const page = `/teacher/paper-check/${id}`;
  const { error } = await supabase.from("paper_tests").update({ status: "approved" }).eq("id", id).eq("status", "submitted");
  if (error) back(page, error.message);

  const test = await loadTest(id);
  if (test?.exam_id) {
    const sheets = await loadSheets(id);
    const rows = sheets
      .filter((s) => s.status === "reviewed" || s.status === "absent")
      .map((s) => ({
        campus_id: test.campus_id,
        exam_id: test.exam_id,
        subject_id: test.subject_id,
        student_id: s.student_id,
        obtained: s.status === "absent" ? null : s.total,
        is_absent: s.status === "absent",
        entered_by: me.id,
      }));
    const { error: e2 } = await supabase.from("marks").upsert(rows, { onConflict: "exam_id,subject_id,student_id" });
    if (e2) back(page, `Approved, but copying marks into the exam failed: ${e2.message}`);
  }
  revalidatePath(page);
  redirect(`${page}?saved=approved`);
}

/** Drafts a quiz with the school's AI for the teacher to read and edit before saving. */
export async function suggestQuiz(a: QuizAsk): Promise<QuizDraft | { error: string }> {
  await requireRole("teacher", "principal", "owner");
  const ask: QuizAsk = {
    subject: String(a.subject).slice(0, 80),
    className: String(a.className).slice(0, 40),
    topic: String(a.topic).trim().slice(0, 300),
    mcqCount: Math.max(0, Math.min(MAX_MCQ, Math.floor(Number(a.mcqCount) || 0))),
    writtenCount: Math.max(0, Math.min(MAX_WRITTEN, Math.floor(Number(a.writtenCount) || 0))),
    options: Math.max(3, Math.min(5, Math.floor(Number(a.options) || 4))),
    language: a.language === "ur" ? "ur" : "en",
  };
  if (ask.topic.length < 3) return { error: "Write the chapter or topic first." };
  if (!ask.mcqCount && !ask.writtenCount) return { error: "Ask for at least one question." };
  try {
    return await draftQuiz(await createClient(), ask);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The AI could not make the quiz just now." };
  }
}
