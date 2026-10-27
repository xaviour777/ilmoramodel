/**
 * Homework tutor rules. The tutor teaches, it does not hand out answers:
 * hint first, then one step, and the full answer only after the student has tried twice.
 * Pure functions so the rules are the same in the API, the page and the tests.
 */

export type TutorStage = "HINT" | "STEP" | "ANSWER" | "PRACTICE" | "DONE";
export type TutorLanguage = "ENGLISH" | "ROMAN_URDU";

export interface TutorMessage {
  role: "student" | "tutor";
  text: string;
  stage?: TutorStage;
  at: string; // ISO time
}

export interface TutorState {
  stage: TutorStage;
  attempts: number; // student tries after the first hint
}

/** Attempts a student must make before the full worked answer is shown. */
export const ATTEMPTS_BEFORE_ANSWER = 2;
/** Messages a student may send per day across all homework (about 30 minutes of use). */
export const DAILY_MESSAGE_LIMIT = 40;
export const PRACTICE_COUNT = 5;

/** Decides what the tutor does with the student's next message. */
export function nextTutorStage(state: TutorState, intent: "try" | "ask_answer" | "next"): TutorState {
  if (state.stage === "PRACTICE" || state.stage === "DONE") return state;
  if (intent === "next" && state.stage === "ANSWER") return { ...state, stage: "PRACTICE" };

  const attempts = intent === "try" ? state.attempts + 1 : state.attempts;
  if (attempts >= ATTEMPTS_BEFORE_ANSWER && (intent === "ask_answer" || state.stage === "STEP")) {
    return { stage: "ANSWER", attempts };
  }
  if (state.stage === "HINT" && (intent === "try" || intent === "ask_answer")) return { stage: "STEP", attempts };
  return { stage: state.stage === "ANSWER" ? "ANSWER" : "STEP", attempts };
}

/** True when the tutor is allowed to show the complete worked answer. */
export function canShowAnswer(state: TutorState): boolean {
  return state.attempts >= ATTEMPTS_BEFORE_ANSWER;
}

const ANSWER_ASKS = ["answer", "jawab", "solution", "hal batao", "bata do", "seedha", "direct"];

export function detectIntent(message: string): "try" | "ask_answer" | "next" {
  const m = message.toLowerCase();
  if (/^(next|aagay|agla|practice)\b/.test(m.trim())) return "next";
  // Short requests only: a longer message that mentions "jawab" is usually the student's own attempt.
  if (ANSWER_ASKS.some((k) => m.includes(k)) && m.trim().length <= 25) return "ask_answer";
  return "try";
}

// Study-only: anything clearly unrelated to school work is turned away politely.
const OFF_TOPIC = [
  "game", "pubg", "free fire", "tiktok", "song", "gaana", "movie", "film", "girlfriend", "boyfriend",
  "dating", "phone number", "address", "password", "hack", "cheat", "gun", "bomb", "drugs", "naked",
];

export function isStudyMessage(message: string): boolean {
  const m = message.toLowerCase();
  return !OFF_TOPIC.some((w) => m.includes(w));
}

/** Contact details and links are never stored or sent to AI. */
export function redactPersonalData(text: string): string {
  return text
    .replace(/(\+?92|0)3\d{2}[\s-]?\d{7}/g, "[number removed]")
    .replace(/\b\d{5}-\d{7}-\d\b/g, "[CNIC removed]")
    .replace(/https?:\/\/\S+/g, "[link removed]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email removed]");
}

export function messagesToday(sessions: Array<{ messages: TutorMessage[] }>, today: string): number {
  return sessions.reduce(
    (n, s) => n + s.messages.filter((m) => m.role === "student" && m.at.slice(0, 10) === today).length,
    0
  );
}

/** First words of the homework line, used as a topic label for reports. */
export function topicFromHomework(content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  const exercise = clean.match(/(chapter|ch\.?|unit|exercise|ex\.?)\s*[\d.]+[^,.;]*/i);
  if (exercise) return exercise[0].slice(0, 60);
  return clean.split(" ").slice(0, 6).join(" ").slice(0, 60);
}

export interface PracticeItem {
  id: string;
  question: string;
  options: string[];
  correct: string; // option text; never sent to the page before the student answers
  explanation: string;
}

export function scorePractice(items: PracticeItem[], answers: Record<string, string>) {
  const results = items.map((it) => ({
    id: it.id,
    isCorrect: answers[it.id] === it.correct,
    correct: it.correct,
    explanation: it.explanation,
  }));
  return { score: results.filter((r) => r.isCorrect).length, total: items.length, results };
}

/** Simple arithmetic practice for math homework when the question bank has nothing for the topic. */
export function mathPractice(seed: number, topic: string): PracticeItem[] {
  let s = seed || 7;
  const rand = (n: number) => {
    s = (s * 9301 + 49297) % 233280;
    return 1 + Math.floor((s / 233280) * n);
  };
  const isFraction = /fraction|kasr/i.test(topic);
  return Array.from({ length: PRACTICE_COUNT }, (_, i) => {
    if (isFraction) {
      const d = [2, 3, 4, 5, 6, 8][rand(6) - 1];
      const a = rand(d - 1);
      const b = rand(d - 1);
      const right = `${a + b}/${d}`;
      const opts = shuffle([right, `${a + b}/${d * 2}`, `${a * b}/${d}`, `${Math.abs(a - b)}/${d}`], s);
      return {
        id: `p${i + 1}`,
        question: `${a}/${d} + ${b}/${d} = ?`,
        options: Array.from(new Set(opts)),
        correct: right,
        explanation: `Denominator same hai (${d}), is liye sirf upar wale jama karein: ${a} + ${b} = ${a + b}.`,
      };
    }
    const a = rand(40) + 5;
    const b = rand(30) + 2;
    const right = String(a * b);
    return {
      id: `p${i + 1}`,
      question: `${a} × ${b} = ?`,
      options: Array.from(new Set(shuffle([right, String(a * b + b), String(a * b - a), String(a + b)], s))),
      correct: right,
      explanation: `${a} × ${b}: pehle ${a} × ${b % 10}, phir ${a} × ${b - (b % 10)}, aur dono jama karein.`,
    };
  });
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
