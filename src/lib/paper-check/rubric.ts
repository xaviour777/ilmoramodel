/**
 * Written-answer rubrics and the rules for turning AI suggestions plus teacher decisions
 * into final marks. AI marks are only ever suggestions: a sheet counts as checked only
 * when the teacher has confirmed every written answer.
 */
import { round1 } from "./omr";

export interface RubricPoint {
  point: string; // e.g. "Definition of photosynthesis"
  marks: number;
  keywords?: string[]; // words a good answer usually contains
}

export interface WrittenQuestion {
  no: number;
  type: "SHORT" | "LONG";
  prompt: string;
  maxMarks: number;
  topic?: string;
  modelAnswer?: string;
  rubric: RubricPoint[];
}

export interface AiSuggestion {
  marks: number | null; // null = AI could not judge; teacher marks it
  matchedPoints: string[];
  missingPoints: string[];
  reason: string;
  confidence: number; // 0..1
  transcript?: string;
  provider: string; // "demo", or the AI company that suggested it
}

export interface WrittenAnswer {
  no: number;
  cropUrl?: string | null;
  transcript?: string | null;
  ai?: AiSuggestion | null;
  finalMarks?: number | null;
  overridden?: boolean;
  teacherNote?: string | null;
}

export function rubricTotal(q: WrittenQuestion): number {
  return round1(q.rubric.reduce((s, p) => s + p.marks, 0));
}

/** Rubric points must add up to the question's marks, every part positive. */
export function validateQuestions(questions: WrittenQuestion[]): string[] {
  const errors: string[] = [];
  for (const q of questions) {
    if (q.maxMarks <= 0) errors.push(`Q${q.no}: marks must be more than 0`);
    if (q.rubric.length === 0) errors.push(`Q${q.no}: add at least one rubric point`);
    if (q.rubric.some((p) => p.marks <= 0)) errors.push(`Q${q.no}: every rubric point needs marks`);
    if (q.rubric.length && Math.abs(rubricTotal(q) - q.maxMarks) > 0.01) {
      errors.push(`Q${q.no}: rubric adds up to ${rubricTotal(q)}, but the question is worth ${q.maxMarks}`);
    }
  }
  return errors;
}

/** "Definition 2, Example 1" -> rubric points. Teachers can type rubrics in one line. */
export function parseRubricLine(line: string): RubricPoint[] {
  return line
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.*?)[\s:=-]*(\d+(?:\.\d+)?)\s*(?:marks?|m)?$/i);
      if (!m || !m[1].trim()) return null;
      return { point: m[1].trim(), marks: Number(m[2]) };
    })
    .filter((p): p is RubricPoint => p !== null);
}

const STOP_WORDS = new Set(
  "the a an of to and or is are was were in on for with by it its this that as at be from which hai ka ki ke ko se aur mein".split(" ")
);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Demo marker used when no AI key is set. It can only judge a typed transcript by matching
 * rubric keywords, so it says so plainly and keeps its confidence low.
 */
export function demoSuggestion(q: WrittenQuestion, transcript?: string | null): AiSuggestion {
  if (!transcript || !transcript.trim()) {
    return {
      marks: null,
      matchedPoints: [],
      missingPoints: q.rubric.map((p) => p.point),
      reason: "Demo AI cannot read handwriting. Look at the answer and tap the marks.",
      confidence: 0,
      provider: "demo",
    };
  }
  const answerWords = new Set(words(transcript));
  let marks = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const p of q.rubric) {
    const explicit = Boolean(p.keywords?.length);
    const keys = explicit ? p.keywords!.flatMap(words) : words(p.point);
    const hits = keys.filter((k) => answerWords.has(k)).length;
    // Teacher keywords are alternatives: half of them (at least one) earns the point.
    const needed = explicit ? Math.max(1, Math.floor(keys.length / 2)) : Math.ceil(keys.length / 2);
    const share = keys.length ? hits / keys.length : 0;
    if (keys.length && hits >= needed) {
      marks += p.marks;
      matched.push(p.point);
    } else if (share > 0) {
      marks += Math.floor(p.marks / 2);
      matched.push(`${p.point} (partly)`);
    } else {
      missing.push(p.point);
    }
  }
  marks = clampMarks(marks, q.maxMarks);
  return {
    marks,
    matchedPoints: matched,
    missingPoints: missing,
    reason: missing.length ? `Missing: ${missing.join(", ")}` : "All rubric points found",
    confidence: 0.35,
    transcript,
    provider: "demo",
  };
}

export function clampMarks(marks: number, max: number): number {
  if (!Number.isFinite(marks)) return 0;
  // Board marking uses half marks at most.
  return Math.max(0, Math.min(max, Math.round(marks * 2) / 2));
}

/** Low-confidence and unmarked answers first, so the teacher checks the hard ones while fresh. */
export function reviewOrder<T extends { ai?: AiSuggestion | null; finalMarks?: number | null }>(items: T[]): T[] {
  const score = (a: T) => (a.finalMarks != null ? 2 : a.ai?.marks == null ? -1 : a.ai.confidence);
  return [...items].sort((a, b) => score(a) - score(b));
}

/** Teacher accepts the AI mark, or sets their own. Returns the updated answer. */
export function decideAnswer(q: WrittenQuestion, answer: WrittenAnswer, marks: number | "accept", note?: string): WrittenAnswer {
  if (marks === "accept") {
    if (answer.ai?.marks == null) throw new Error(`Q${q.no}: there is no AI mark to accept; enter the marks`);
    return { ...answer, finalMarks: clampMarks(answer.ai.marks, q.maxMarks), overridden: false, teacherNote: note ?? null };
  }
  if (marks < 0 || marks > q.maxMarks) throw new Error(`Q${q.no}: marks must be between 0 and ${q.maxMarks}`);
  return {
    ...answer,
    finalMarks: clampMarks(marks, q.maxMarks),
    overridden: answer.ai?.marks == null ? false : clampMarks(marks, q.maxMarks) !== clampMarks(answer.ai.marks, q.maxMarks),
    teacherNote: note ?? null,
  };
}

export interface SheetTotals {
  written: number;
  total: number;
  isComplete: boolean; // every written answer has a teacher-confirmed mark
  pending: number;
}

export function sheetTotals(questions: WrittenQuestion[], answers: WrittenAnswer[], mcqScore: number): SheetTotals {
  let written = 0;
  let pending = 0;
  for (const q of questions) {
    const a = answers.find((x) => x.no === q.no);
    if (a?.finalMarks == null) pending++;
    else written += a.finalMarks;
  }
  return { written: round1(written), total: round1(written + mcqScore), isComplete: pending === 0, pending };
}

export function testMaxMarks(mcqCount: number, marksEach: number, questions: WrittenQuestion[]): number {
  return round1(mcqCount * marksEach + questions.reduce((s, q) => s + q.maxMarks, 0));
}
