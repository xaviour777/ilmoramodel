/**
 * Quiz questions: the MCQ text a teacher types (or the AI drafts) in one box, and the AI
 * quiz maker. The teacher always reads and edits the draft before saving.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { callAi } from "@/lib/ai";
import { OPTION_LETTERS } from "./layout";

export type McqQuestion = { q: string; options: string[] };

/**
 * Reads the MCQ box: a numbered question line, then one line per option ("A) ...").
 *   1. What is the unit of force?
 *   A) Joule  B) Newton ...   (one option per line)
 */
export function parseMcqText(text: string): McqQuestion[] {
  const out: McqQuestion[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const opt = line.match(/^\(?([A-Ea-e])[).:]\s*(.+)$/);
    const q = line.match(/^(?:Q\s*)?\d+[).:]\s*(.+)$/i);
    if (opt && out.length) out[out.length - 1].options.push(opt[2].trim());
    else if (q) out.push({ q: q[1].trim(), options: [] });
    else if (out.length) {
      // a question that runs onto a second line
      const last = out[out.length - 1];
      if (last.options.length) last.options[last.options.length - 1] += ` ${line}`;
      else last.q += ` ${line}`;
    }
  }
  return out;
}

export function mcqText(qs: McqQuestion[]): string {
  return qs.map((m, i) => [`${i + 1}. ${m.q}`, ...m.options.map((o, k) => `${OPTION_LETTERS.at(k)}) ${o}`)].join("\n")).join("\n\n");
}

export type QuizDraft = {
  mcqs: { q: string; options: string[]; answer: string }[];
  written: { prompt: string; marks: number; rubric: string; topic: string }[];
};

const QUIZ_SCHEMA = {
  type: "object",
  properties: {
    mcqs: {
      type: "array",
      items: {
        type: "object",
        properties: { q: { type: "string" }, options: { type: "array", items: { type: "string" } }, answer: { type: "string" } },
        required: ["q", "options", "answer"],
        additionalProperties: false,
      },
    },
    written: {
      type: "array",
      items: {
        type: "object",
        properties: { prompt: { type: "string" }, marks: { type: "number" }, rubric: { type: "string" }, topic: { type: "string" } },
        required: ["prompt", "marks", "rubric", "topic"],
        additionalProperties: false,
      },
    },
  },
  required: ["mcqs", "written"],
  additionalProperties: false,
};

export type QuizAsk = {
  subject: string;
  className: string;
  topic: string;
  mcqCount: number;
  writtenCount: number;
  options: number;
  language: "en" | "ur";
};

/** Asks the school's AI for a quiz draft. Throws with a plain reason when AI is off or out of budget. */
export async function draftQuiz(supabase: SupabaseClient, a: QuizAsk): Promise<QuizDraft> {
  const letters = OPTION_LETTERS.slice(0, a.options).join(", ");
  const r = await callAi(supabase, {
    feature: "quiz",
    maxTokens: 6000,
    schema: QUIZ_SCHEMA,
    system: [
      `You write class tests for a ${a.className} class in Punjab, Pakistan, following the Punjab Curriculum and Textbook Board syllabus and the Punjab board (BISE) paper style.`,
      `Subject: ${a.subject}.`,
      a.language === "ur" ? "Write the questions in Urdu script." : "Write the questions in simple English.",
      `MCQs: exactly ${a.options} options each, one correct answer given as a letter (${letters}). Spread the correct letters; no "all of the above".`,
      "Written questions: Punjab board short-question style (2 or 3 marks) or long-question style (4 to 5 marks).",
      "rubric = the marking points with marks, like \"Definition 2, Example 1\"; their marks must add up exactly to the question's marks.",
      "topic = the chapter or topic in a few words. Only syllabus content; no trick questions.",
    ].join("\n"),
    messages: [{ role: "user", text: `Make ${a.mcqCount} MCQs and ${a.writtenCount} written questions on: ${a.topic}` }],
  });
  if (!r.ok) {
    if (r.reason === "off") throw new Error("AI is off. The principal can turn it on in Settings → AI.");
    if (r.reason === "budget") throw new Error("Today's AI limit is used up. Try tomorrow, or ask the principal to raise it.");
    throw new Error(r.message ?? "The AI could not make the quiz just now.");
  }
  const d = JSON.parse(r.text) as QuizDraft;
  const allowed = OPTION_LETTERS.slice(0, a.options) as readonly string[];
  return {
    mcqs: (d.mcqs ?? []).slice(0, a.mcqCount)
      .map((m) => ({ q: m.q, options: m.options.slice(0, a.options), answer: String(m.answer).trim().toUpperCase().slice(0, 1) }))
      .filter((m) => m.options.length === a.options && allowed.includes(m.answer)),
    written: (d.written ?? []).slice(0, a.writtenCount).filter((w) => w.prompt && w.marks > 0),
  };
}
