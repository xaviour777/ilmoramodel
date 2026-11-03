"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { draftBank, type BankAsk, type BankDraft } from "@/lib/paper-check/quiz";
import { makePaper, replacement, totalMarks, type BankQuestion, type Pattern, type PaperItem } from "@/lib/question-paper";
import { MAX_MCQ } from "@/lib/paper-check/layout";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number(str(f, k)) || 0)));
const staff = () => requireRole("teacher", "principal", "owner");
const LETTERS = ["A", "B", "C", "D", "E"];

// ---------- Question bank ----------
export async function addQuestion(f: FormData) {
  const me = await staff();
  const supabase = await createClient();
  const back = `/teacher/paper-check/bank?class=${str(f, "class_id")}&subject=${str(f, "subject_id")}&chapter=${encodeURIComponent(str(f, "chapter"))}`;
  const kind = str(f, "kind");
  const options = str(f, "options").split(/\r?\n/).map((o) => o.replace(/^\(?[A-Ea-e][).:]\s*/, "").trim()).filter(Boolean);
  const answer = kind === "mcq" ? str(f, "answer").toUpperCase().slice(0, 1) : str(f, "answer");
  if (kind === "mcq" && (options.length < 2 || options.length > 5)) redirect(`${back}&error=${encodeURIComponent("An MCQ needs 2 to 5 options, one per line.")}`);
  if (kind === "mcq" && !LETTERS.slice(0, options.length).includes(answer)) redirect(`${back}&error=${encodeURIComponent("Choose the right option's letter.")}`);
  const { error } = await supabase.from("question_bank").insert({
    campus_id: me.campus_id, class_id: str(f, "class_id"), subject_id: str(f, "subject_id"), chapter: str(f, "chapter"),
    kind, question: str(f, "question"), options: kind === "mcq" ? options : [], answer: answer || null,
    source: str(f, "source") || "teacher", language: /[؀-ۿ]/.test(str(f, "question")) ? "ur" : "en",
  });
  if (error) redirect(`${back}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/teacher/paper-check/bank");
  redirect(`${back}&saved=1`);
}

export async function deleteQuestion(f: FormData) {
  await staff();
  const supabase = await createClient();
  const { error } = await supabase.from("question_bank").delete().eq("id", str(f, "id"));
  const back = `/teacher/paper-check/bank?class=${str(f, "class_id")}&subject=${str(f, "subject_id")}&chapter=${encodeURIComponent(str(f, "chapter"))}`;
  if (error) redirect(`${back}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/teacher/paper-check/bank");
  redirect(back);
}

export async function draftBankQuestions(a: BankAsk): Promise<BankDraft | { error: string }> {
  await staff();
  const ask: BankAsk = {
    subject: String(a.subject).slice(0, 80), className: String(a.className).slice(0, 40), chapter: String(a.chapter).trim().slice(0, 120),
    mcq: Math.max(0, Math.min(30, Math.floor(Number(a.mcq) || 0))), short: Math.max(0, Math.min(30, Math.floor(Number(a.short) || 0))),
    long: Math.max(0, Math.min(10, Math.floor(Number(a.long) || 0))), language: a.language === "ur" ? "ur" : "en",
  };
  if (ask.chapter.length < 2) return { error: "Write the chapter first." };
  if (!ask.mcq && !ask.short && !ask.long) return { error: "Ask for at least one question." };
  try {
    return await draftBank(await createClient(), ask);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The AI could not make questions just now." };
  }
}

export async function saveDrafts(p: { classId: string; subjectId: string; chapter: string; items: BankDraft }): Promise<{ saved: number } | { error: string }> {
  const me = await staff();
  const supabase = await createClient();
  const rows = (p.items ?? []).slice(0, 80).filter((q) => q.question?.trim()).map((q) => ({
    campus_id: me.campus_id, class_id: p.classId, subject_id: p.subjectId, chapter: String(p.chapter).trim().slice(0, 120),
    kind: q.kind, question: q.question.trim(), options: q.kind === "mcq" ? q.options : [], answer: q.answer || null,
    source: "ai", language: /[؀-ۿ]/.test(q.question) ? "ur" : "en",
  }));
  if (!rows.length) return { error: "Tick at least one question." };
  const { error } = await supabase.from("question_bank").insert(rows);
  if (error) return { error: error.message };
  revalidatePath("/teacher/paper-check/bank");
  return { saved: rows.length };
}

// ---------- Papers ----------
async function bankFor(supabase: Awaited<ReturnType<typeof createClient>>, classId: string, subjectId: string, chapters: string[], exerciseOnly: boolean) {
  let q = supabase.from("question_bank").select("id, chapter, kind, question, options, answer, source")
    .eq("class_id", classId).eq("subject_id", subjectId).in("chapter", chapters).limit(5000);
  if (exerciseOnly) q = q.in("source", ["exercise", "past_paper"]);
  const { data } = await q;
  return (data ?? []) as BankQuestion[];
}

export async function makeQuestionPaper(f: FormData) {
  const me = await staff();
  const supabase = await createClient();
  const classId = str(f, "class_id");
  const subjectId = str(f, "subject_id");
  const chapters = f.getAll("chapter").map(String).filter(Boolean);
  const back = `/teacher/paper-check/papers?class=${classId}&subject=${subjectId}`;
  const fail = (m: string): never => redirect(`${back}&error=${encodeURIComponent(m)}`);
  if (!chapters.length) fail("Tick at least one chapter.");
  const pattern: Pattern = {
    mcq: { count: num(f, "mcq_count", 0, 60), marks: num(f, "mcq_marks", 1, 5) },
    short: { groups: num(f, "short_groups", 0, 5), perGroup: num(f, "short_per", 0, 15), attempt: num(f, "short_attempt", 0, 15), marks: num(f, "short_marks", 1, 10) },
    long: { count: num(f, "long_count", 0, 10), attempt: num(f, "long_attempt", 0, 10), marks: num(f, "long_marks", 1, 20) },
    minutes: num(f, "minutes", 10, 240),
  };
  if (pattern.short.attempt > pattern.short.perGroup) fail("Short questions: 'attempt' can't be more than the questions in a group.");
  if (pattern.long.attempt > pattern.long.count) fail("Long questions: 'attempt' can't be more than the questions given.");
  if (!pattern.short.groups) pattern.short.perGroup = pattern.short.attempt = 0;
  if (totalMarks(pattern) <= 0) fail("The paper has no marks. Add some questions.");
  const bank = await bankFor(supabase, classId, subjectId, chapters, str(f, "mode") === "exercise");
  const made = makePaper(bank, pattern);
  if ("short" in made) fail(`Not enough questions in the bank for these chapters: ${made.short}. Add more in Question bank, tick more chapters, or lower the numbers.`);
  const { data, error } = await supabase.from("question_papers").insert({
    campus_id: me.campus_id, class_id: classId, subject_id: subjectId, title: str(f, "title") || "Paper",
    chapters, pattern, items: (made as { items: PaperItem[] }).items, minutes: pattern.minutes,
  }).select("id").single();
  if (error) fail(error.message);
  redirect(`/teacher/paper-check/papers/${data!.id}`);
}

export async function replaceItem(f: FormData) {
  await staff();
  const supabase = await createClient();
  const id = str(f, "paper_id");
  const at = Number(str(f, "at"));
  const back = `/teacher/paper-check/papers/${id}`;
  const { data: paper } = await supabase.from("question_papers").select("class_id, subject_id, chapters, items").eq("id", id).maybeSingle();
  if (!paper) redirect("/teacher/paper-check/papers");
  const items = paper!.items as PaperItem[];
  if (!items[at]) redirect(back);
  const q = replacement(await bankFor(supabase, paper!.class_id, paper!.subject_id, paper!.chapters, false), items, at);
  if (!q) redirect(`${back}?error=${encodeURIComponent("No other question of this kind in the bank for these chapters.")}`);
  items[at] = { ...items[at], qid: q!.id, chapter: q!.chapter, question: q!.question, options: q!.options, answer: q!.answer };
  const { error } = await supabase.from("question_papers").update({ items }).eq("id", id);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(back);
  redirect(`${back}#q-${at}`);
}

export async function deletePaper(f: FormData) {
  await staff();
  const supabase = await createClient();
  await supabase.from("question_papers").delete().eq("id", str(f, "paper_id"));
  revalidatePath("/teacher/paper-check/papers");
  redirect("/teacher/paper-check/papers");
}

// Section A of the paper becomes a test in Paper checking: print the bubble sheets, scan, MCQs mark themselves.
export async function mcqTestFromPaper(f: FormData) {
  const me = await staff();
  const supabase = await createClient();
  const id = str(f, "paper_id");
  const back = `/teacher/paper-check/papers/${id}`;
  const { data: paper } = await supabase.from("question_papers").select("title, subject_id, items, pattern").eq("id", id).maybeSingle();
  if (!paper) redirect("/teacher/paper-check/papers");
  const mcqs = (paper!.items as PaperItem[]).filter((i) => i.section === "A" && i.answer);
  if (!mcqs.length) redirect(`${back}?error=${encodeURIComponent("This paper has no MCQs.")}`);
  if (mcqs.length > MAX_MCQ) redirect(`${back}?error=${encodeURIComponent(`At most ${MAX_MCQ} MCQs fit on one answer sheet.`)}`);
  const options = Math.max(...mcqs.map((m) => m.options.length));
  const { data: test, error } = await supabase.from("paper_tests").insert({
    campus_id: me.campus_id, section_id: str(f, "section_id"), subject_id: paper!.subject_id,
    title: `${paper!.title} (Section A)`, mcq_key: mcqs.map((m) => m.answer), mcq_marks_each: (paper!.pattern as Pattern).mcq.marks,
    options_per_mcq: options, questions: [], mcq_questions: mcqs.map((m) => ({ q: m.question, options: m.options })),
    auto_publish: false, created_by: me.id,
  }).select("id").single();
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message.includes("row-level security") ? "You can only make tests for sections you teach." : error.message)}`);
  redirect(`/teacher/paper-check/${test!.id}`);
}
