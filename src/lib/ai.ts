/**
 * AI provider for paper checking and the homework tutor.
 * - Demo provider (default, and always in tests): rule-based, labelled "Demo AI".
 * - Live provider: when the principal has turned AI on in Settings → AI, with a key and budget left.
 *   Calls go through the "ai" edge function, which holds the key and counts the cost.
 * Only the question, rubric and the answer crop are sent; never names, phones or ids.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiSuggestion, WrittenQuestion, clampMarks, demoSuggestion } from "@/lib/paper-check/rubric";
import { TutorLanguage, TutorMessage, TutorStage } from "@/lib/tutor/tutor";

export interface TutorTurnInput {
  stage: TutorStage;
  subject: string;
  classLevel: string;
  homework: string;
  question: string;
  language: TutorLanguage;
  history: TutorMessage[];
}

export interface LearningAiProvider {
  readonly name: string; // "demo", or the AI company in use
  readonly vision: boolean;
  suggestWrittenMarks(q: WrittenQuestion, answer: { imageBase64?: string | null; transcript?: string | null }): Promise<AiSuggestion>;
  tutorReply(input: TutorTurnInput): Promise<string>;
}

export class DemoLearningAi implements LearningAiProvider {
  readonly name = "demo";
  readonly vision = false;

  async suggestWrittenMarks(q: WrittenQuestion, answer: { transcript?: string | null }): Promise<AiSuggestion> {
    return demoSuggestion(q, answer.transcript);
  }

  async tutorReply(input: TutorTurnInput): Promise<string> {
    const ur = input.language === "ROMAN_URDU";
    const isMath = /math|riyazi|ریاضی/i.test(input.subject);
    const q = input.question.trim();
    switch (input.stage) {
      case "HINT":
        return ur
          ? isMath
            ? `Chalo saath karte hain. Pehle sawal ko dhyan se parho: "${q}". Kaun se numbers diye gaye hain aur kya maloom karna hai? Sirf pehla qadam likh kar bhejo.`
            : `Achha sawal hai. Pehle kitaab mein ${input.subject} ka woh hissa dhoondo jahan ye topic hai. Sawal mein sab se zaroori lafz kaun sa hai? Apne alfaaz mein ek line likho.`
          : isMath
            ? `Let's do it together. Read the question again: "${q}". What is given and what do you need to find? Send me just your first step.`
            : `Good question. Find the part of your ${input.subject} book that covers this. Which word in the question matters most? Write one line in your own words.`;
      case "STEP":
        return ur
          ? isMath
            ? `Shabash, koshish achhi hai. Agla qadam: jo cheez maloom karni hai usay ek formula ya qaida se jodo, phir numbers rakh kar hal karo. Apna jawab bhejo, main check karta hoon.`
            : `Achha. Ab teen cheezein likho: (1) iska matlab kya hai, (2) ek misaal, (3) ye kyun zaroori hai. Likh kar bhejo.`
          : isMath
            ? `Nice try. Next step: connect what you need to find with a rule or formula, then put in the numbers. Send me your answer and I will check it.`
            : `Good. Now write three things: (1) what it means, (2) one example, (3) why it matters. Send it to me.`;
      case "ANSWER":
        return ur
          ? `Tum ne do dafa koshish ki, shabash. Ab poora tareeqa dekho:\n1. Sawal mein kya diya gaya hai, woh likho.\n2. Kitaab ka qaida ya definition yaad karo.\n3. Qadam ba qadam lagao aur har line ke saath wajah likho.\n4. Aakhir mein jawab dobara check karo.\nApni copy mein khud likho, phir "practice" likho taake 5 chhote sawal karein.\n(Demo AI: asal AI lagne ke baad yahan isi sawal ka mukammal hal aayega.)`
          : `You tried twice, well done. Here is the full method:\n1. Write what the question gives you.\n2. Recall the rule or definition from your book.\n3. Apply it step by step, with a reason on each line.\n4. Check your answer at the end.\nWrite it in your notebook yourself, then type "practice" for 5 short questions.\n(Demo AI: with the real AI turned on, the full worked solution for this question appears here.)`;
      default:
        return ur ? `Practice ke sawal neeche hain.` : `Your practice questions are below.`;
    }
  }
}

const MARKING_SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    marks: { type: ["number", "null"] },
    matchedPoints: { type: "array", items: { type: "string" } },
    missingPoints: { type: "array", items: { type: "string" } },
    reason: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["transcript", "marks", "matchedPoints", "missingPoints", "reason", "confidence"],
  additionalProperties: false,
};

export type AiRequest = {
  feature: "tutor" | "marks" | "notice";
  system?: string;
  messages: { role: "user" | "assistant"; text: string }[];
  image?: string | null;
  schema?: Record<string, unknown> | null;
  maxTokens?: number;
};
export type AiAnswer =
  | { ok: true; text: string; provider: string; model: string }
  | { ok: false; reason: "off" | "budget" | "refused" | "error"; message?: string };

/** One AI call through the edge function, as the signed-in person. */
export async function callAi(supabase: SupabaseClient, req: AiRequest): Promise<AiAnswer> {
  const { data, error } = await supabase.functions.invoke("ai", { body: req });
  if (error) return { ok: false, reason: "error", message: error.message };
  return data as AiAnswer;
}

export class AiBudgetError extends Error {}

export class LiveLearningAi implements LearningAiProvider {
  constructor(private supabase: SupabaseClient, readonly name: string, readonly vision: boolean) {}

  private async ask(req: AiRequest): Promise<string | null> {
    const r = await callAi(this.supabase, req);
    if (r.ok) return r.text;
    if (r.reason === "budget") throw new AiBudgetError("Today's AI budget is used up");
    if (r.reason === "refused") return null;
    throw new Error(r.reason === "off" ? "AI is turned off" : r.message ?? "AI error");
  }

  async suggestWrittenMarks(q: WrittenQuestion, answer: { imageBase64?: string | null; transcript?: string | null }): Promise<AiSuggestion> {
    const rubric = q.rubric.map((p, i) => `${i + 1}. ${p.point} (${p.marks} marks)`).join("\n");
    const image = this.vision ? answer.imageBase64 ?? null : null;
    const text = [
      `You are helping a Pakistani school teacher mark a Punjab board style ${q.type === "LONG" ? "long" : "short"} answer.`,
      `Question ${q.no} (${q.maxMarks} marks): ${q.prompt}`,
      q.modelAnswer ? `Model answer: ${q.modelAnswer}` : "",
      `Rubric:\n${rubric}`,
      image
        ? "The image is the student's handwritten answer box. Transcribe it, then mark it against the rubric."
        : `Student answer (typed): ${answer.transcript ?? ""}`,
      "Give marks in steps of 0.5. If the writing is unreadable or is mostly Urdu Nastaliq you cannot read reliably, set marks to null and say why.",
      "confidence is 0 to 1: how sure you are a careful teacher would give the same marks. The teacher makes the final decision.",
    ].filter(Boolean).join("\n\n");
    if (!image && !answer.transcript) {
      return { ...demoSuggestion(q, null), reason: "This AI model can't read photos. Please mark it yourself.", provider: this.name };
    }
    const out = await this.ask({ feature: "marks", messages: [{ role: "user", text }], image, schema: MARKING_SCHEMA, maxTokens: 4000 });
    if (out == null) return { ...demoSuggestion(q, null), reason: "AI declined this answer. Please mark it yourself.", provider: this.name };
    const parsed = JSON.parse(out) as Omit<AiSuggestion, "provider">;
    return {
      transcript: parsed.transcript,
      marks: parsed.marks == null ? null : clampMarks(parsed.marks, q.maxMarks),
      matchedPoints: parsed.matchedPoints ?? [],
      missingPoints: parsed.missingPoints ?? [],
      reason: parsed.reason ?? "",
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      provider: this.name,
    };
  }

  async tutorReply(input: TutorTurnInput): Promise<string> {
    const ur = input.language === "ROMAN_URDU";
    const lang = ur ? "simple Roman Urdu (Urdu written in English letters)" : "simple English";
    const stageRule: Record<TutorStage, string> = {
      HINT: "Give ONE short hint that points the student in the right direction. Do not solve anything. End with a question.",
      STEP: "Look at what the student wrote. Say what is right, correct one mistake, and give only the next step. Do not give the final answer.",
      ANSWER: "The student has tried twice. Now show the complete worked solution step by step, then ask them to write it in their notebook.",
      PRACTICE: "Encourage the student briefly.",
      DONE: "Encourage the student briefly.",
    };
    const system = [
      `You are Ilmora's homework tutor for a ${input.classLevel} student in Punjab, Pakistan, following the Punjab textbook.`,
      `Subject: ${input.subject}. Today's homework: ${input.homework}`,
      `Reply in ${lang}, at most 120 words, warm and encouraging.`,
      "Only talk about school work. If asked anything else, gently bring the student back to the homework.",
      "Never ask for or repeat personal information.",
      stageRule[input.stage],
    ].join("\n");

    const messages: AiRequest["messages"] = [{ role: "user", text: `Homework question: ${input.question}` }];
    for (const m of input.history) messages.push({ role: m.role === "student" ? "user" : "assistant", text: m.text });
    if (messages[messages.length - 1].role === "assistant") messages.push({ role: "user", text: "Please continue." });

    try {
      const out = await this.ask({ feature: "tutor", system, messages, maxTokens: 2000 });
      if (out != null) return out;
      return ur ? "Is baare mein main madad nahi kar sakta. Chalo homework par wapas aate hain." : "I can't help with that. Let's get back to the homework.";
    } catch {
      // budget used up or the AI company is down: the tutor still answers, from the demo steps
      return new DemoLearningAi().tutorReply(input);
    }
  }
}

export type AiStatus = { ready: boolean; provider: string; model: string; vision: boolean; spent_today: number; daily_budget: number };

/** The campus's AI switch, model and today's spend (never the key). */
export async function aiStatus(supabase: SupabaseClient): Promise<AiStatus | null> {
  const { data } = await supabase.rpc("ai_status");
  const row = (Array.isArray(data) ? data[0] : data) as AiStatus | undefined;
  return row ? { ...row, spent_today: Number(row.spent_today), daily_budget: Number(row.daily_budget) } : null;
}

let override: LearningAiProvider | null = null;

/** Tests call this to force a provider. */
export function setLearningAiProvider(p: LearningAiProvider | null) {
  override = p;
}

export async function getLearningAi(supabase: SupabaseClient): Promise<LearningAiProvider> {
  if (override) return override;
  if (process.env.NODE_ENV === "test") return new DemoLearningAi();
  const s = await aiStatus(supabase);
  return s?.ready ? new LiveLearningAi(supabase, s.provider, s.vision) : new DemoLearningAi();
}
