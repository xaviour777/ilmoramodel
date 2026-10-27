/**
 * MCQ bubble reading and scoring. Pure functions so they run in the browser scanner,
 * on the server, and in tests.
 */
import { OPTION_LETTERS } from "./layout";

/** A bubble counts as filled at or above this share of dark pixels. */
export const FILL_MIN = 0.45;
/** A second bubble this close to the darkest one means the student filled two. */
export const DOUBLE_RATIO = 0.75;

export const BLANK = null;
export const DOUBLE = "*";
export type McqAnswer = string | null; // "A".."E", null = blank, "*" = more than one filled

/** fills[q][o] = share of dark pixels (0..1) inside bubble o of question q. */
export function readMcqAnswers(fills: number[][]): McqAnswer[] {
  return fills.map((row) => {
    let best = -1;
    let bestFill = 0;
    for (let o = 0; o < row.length; o++) {
      if (row[o] > bestFill) {
        bestFill = row[o];
        best = o;
      }
    }
    if (best < 0 || bestFill < FILL_MIN) return BLANK;
    const others = row.filter((f, o) => o !== best && f >= FILL_MIN && f >= bestFill * DOUBLE_RATIO);
    if (others.length > 0) return DOUBLE;
    return OPTION_LETTERS[best];
  });
}

export interface McqScore {
  score: number;
  max: number;
  correct: number;
  wrong: number;
  blank: number;
  double: number;
  perQuestion: Array<{ question: number; answer: McqAnswer; key: string; isCorrect: boolean }>;
}

/** Blank and double-filled answers score zero. No negative marking. */
export function scoreMcq(key: string[], answers: McqAnswer[], marksEach: number): McqScore {
  const perQuestion = key.map((k, i) => {
    const answer = answers[i] ?? BLANK;
    return { question: i + 1, answer, key: k, isCorrect: answer !== BLANK && answer !== DOUBLE && answer === k };
  });
  const correct = perQuestion.filter((p) => p.isCorrect).length;
  const blank = perQuestion.filter((p) => p.answer === BLANK).length;
  const double = perQuestion.filter((p) => p.answer === DOUBLE).length;
  return {
    score: round1(correct * marksEach),
    max: round1(key.length * marksEach),
    correct,
    wrong: key.length - correct - blank - double,
    blank,
    double,
    perQuestion,
  };
}

/** Reasons a scanned sheet goes into the teacher's "Check karein" list. */
export function sheetFlags(score: McqScore, opts: { qrMissing?: boolean; markersMissing?: boolean; blurry?: boolean } = {}): string[] {
  const flags: string[] = [];
  if (opts.qrMissing) flags.push("QR_NOT_READ");
  if (opts.markersMissing) flags.push("CORNERS_NOT_FOUND");
  if (opts.blurry) flags.push("BLURRY");
  if (score.double > 0) flags.push("DOUBLE_FILLED");
  if (score.max > 0 && score.blank === score.perQuestion.length) flags.push("ALL_BLANK");
  return flags;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
