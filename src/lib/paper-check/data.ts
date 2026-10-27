import { createClient } from "@/lib/supabase/server";
import type { McqAnswer } from "./omr";
import { sheetTotals, testMaxMarks, type WrittenAnswer, type WrittenQuestion } from "./rubric";

// Reading and saving paper-check rows. Every query runs as the signed-in person,
// so row-level security decides which tests and sheets they reach.

export type TestStatus = "checking" | "submitted" | "approved";
export type SheetStatus = "pending" | "scanned" | "reviewed" | "absent";

export type PaperTest = {
  id: string;
  campus_id: string;
  section_id: string;
  subject_id: string;
  exam_id: string | null;
  title: string;
  test_date: string;
  mcq_key: string[];
  mcq_marks_each: number;
  options_per_mcq: number;
  questions: WrittenQuestion[];
  status: TestStatus;
  sections: { name: string; classes: { name: string } } | null;
  subjects: { name: string } | null;
};

export type PaperSheet = {
  id: string;
  test_id: string;
  student_id: string;
  mcq_answers: McqAnswer[] | null;
  mcq_score: number;
  flags: string[];
  answers: WrittenAnswer[];
  total: number | null;
  status: SheetStatus;
  students: { full_name: string; roll_no: string | null } | null;
};

/** Flags that keep a sheet in the check list until the teacher fixes it. */
export const BLOCKING_FLAGS = ["DOUBLE_FILLED", "BLURRY"];
export const hasBlockingFlag = (flags: string[]) => flags.some((f) => BLOCKING_FLAGS.includes(f));

export { FLAG_LABEL } from "./data-labels";

const TEST_COLS =
  "id, campus_id, section_id, subject_id, exam_id, title, test_date, mcq_key, mcq_marks_each, options_per_mcq, questions, status, sections(name, classes(name)), subjects(name)";

export function testLabel(t: PaperTest) {
  return `${t.sections?.classes.name ?? ""}-${t.sections?.name ?? ""} · ${t.subjects?.name ?? ""}`;
}

export function maxMarksOf(t: Pick<PaperTest, "mcq_key" | "mcq_marks_each" | "questions">) {
  return testMaxMarks(t.mcq_key.length, Number(t.mcq_marks_each), t.questions);
}

export async function loadTest(id: string): Promise<PaperTest | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("paper_tests").select(TEST_COLS).eq("id", id).maybeSingle();
  return (data as unknown as PaperTest) ?? null;
}

export async function loadSheets(testId: string): Promise<PaperSheet[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("paper_sheets")
    .select("id, test_id, student_id, mcq_answers, mcq_score, flags, answers, total, status, students(full_name, roll_no)")
    .eq("test_id", testId);
  return ((data ?? []) as unknown as PaperSheet[]).sort((a, b) =>
    (a.students?.roll_no ?? "").localeCompare(b.students?.roll_no ?? "", undefined, { numeric: true }),
  );
}

export async function listTests(): Promise<PaperTest[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("paper_tests").select(TEST_COLS).order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as unknown as PaperTest[];
}

/** Totals and status after a change to a sheet's written marks or MCQs. */
export function settleSheet(questions: WrittenQuestion[], answers: WrittenAnswer[], mcqScore: number, flags: string[]) {
  const totals = sheetTotals(questions, answers, mcqScore);
  const remaining = totals.isComplete ? flags.filter((f) => f !== "NEEDS_TEACHER_MARKS") : flags;
  const done = totals.isComplete && !hasBlockingFlag(remaining);
  return {
    flags: remaining,
    total: totals.isComplete ? totals.total : null,
    status: (done ? "reviewed" : "scanned") as SheetStatus,
    totals,
  };
}

/** Per-question class report: which questions most students got wrong. */
export function weaknessReport(test: PaperTest, sheets: PaperSheet[]) {
  const checked = sheets.filter((s) => s.status === "reviewed" || s.status === "scanned");
  const n = checked.length;
  const mcq = test.mcq_key.map((k, i) => {
    const counts: Record<string, number> = {};
    let right = 0;
    for (const s of checked) {
      const a = (s.mcq_answers ?? [])[i] ?? "blank";
      counts[a] = (counts[a] ?? 0) + 1;
      if (a === k) right++;
    }
    const wrong = Object.entries(counts).filter(([a]) => a !== k).sort((x, y) => y[1] - x[1])[0];
    return { question: i + 1, key: k, correctPct: n ? Math.round((right / n) * 100) : 0, commonWrong: wrong ? wrong[0] : null };
  });
  const written = test.questions.map((q) => {
    const marks = checked
      .map((s) => s.answers.find((a) => a.no === q.no)?.finalMarks)
      .filter((m): m is number => m != null);
    const avg = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : 0;
    const missing: Record<string, number> = {};
    for (const s of checked) {
      for (const p of s.answers.find((a) => a.no === q.no)?.ai?.missingPoints ?? []) missing[p] = (missing[p] ?? 0) + 1;
    }
    return {
      question: q.no,
      topic: q.topic ?? "",
      averagePct: q.maxMarks ? Math.round((avg / q.maxMarks) * 100) : 0,
      mostMissed: Object.entries(missing).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p]) => p),
    };
  });
  return { checked: n, weakMcqs: mcq.filter((m) => m.correctPct < 50).sort((a, b) => a.correctPct - b.correctPct), written };
}

export type CheckSection = { id: string; label: string };

/** Sections this person may create tests for: their own as a teacher, every section for the principal. */
export async function checkableSections(me: { id: string; role: string }): Promise<CheckSection[]> {
  const supabase = await createClient();
  if (me.role === "principal" || me.role === "owner") {
    const { data } = await supabase.from("sections").select("id, name, classes(name, sort)");
    return ((data ?? []) as unknown as { id: string; name: string; classes: { name: string; sort: number } }[])
      .sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name))
      .map((s) => ({ id: s.id, label: `${s.classes.name}-${s.name}` }));
  }
  const { mySections } = await import("@/lib/teacher");
  return (await mySections(me.id)).map((s) => ({ id: s.id, label: s.label }));
}
