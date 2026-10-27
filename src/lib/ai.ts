/**
 * AI provider for paper checking and the homework tutor.
 * - Demo provider (default, and always in tests): rule-based, labelled "Demo AI".
 * - Claude provider: used only when ANTHROPIC_API_KEY is set.
 * Only the question, rubric and the answer crop are sent; never names, phones or ids.
 */
import Anthropic from "@anthropic-ai/sdk";
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
  readonly name: "demo" | "claude";
  suggestWrittenMarks(q: WrittenQuestion, answer: { imageBase64?: string | null; transcript?: string | null }): Promise<AiSuggestion>;
  tutorReply(input: TutorTurnInput): Promise<string>;
}

export const CLAUDE_MODEL = "claude-opus-5-5";

export class DemoLearningAi implements LearningAiProvider {
  readonly name = "demo" as const;

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

export class ClaudeLearningAi implements LearningAiProvider {
  readonly name = "claude" as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async suggestWrittenMarks(q: WrittenQuestion, answer: { imageBase64?: string | null; transcript?: string | null }): Promise<AiSuggestion> {
    const rubric = q.rubric.map((p, i) => `${i + 1}. ${p.point} (${p.marks} marks)`).join("\n");
    const content: Anthropic.ContentBlockParam[] = [];
    if (answer.imageBase64) {
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: answer.imageBase64 } });
    }
    content.push({
      type: "text",
      text: [
        `You are helping a Pakistani school teacher mark a Punjab board style ${q.type === "LONG" ? "long" : "short"} answer.`,
        `Question ${q.no} (${q.maxMarks} marks): ${q.prompt}`,
        q.modelAnswer ? `Model answer: ${q.modelAnswer}` : "",
        `Rubric:\n${rubric}`,
        answer.imageBase64
          ? "The image is the student's handwritten answer box. Transcribe it, then mark it against the rubric."
          : `Student answer (typed): ${answer.transcript ?? ""}`,
        "Give marks in steps of 0.5. If the writing is unreadable or is mostly Urdu Nastaliq you cannot read reliably, set marks to null and say why.",
        "confidence is 0 to 1: how sure you are a careful teacher would give the same marks. The teacher makes the final decision.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    const response = await this.client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: { type: "json_schema", schema: MARKING_SCHEMA } },
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") {
      return { ...demoSuggestion(q, null), reason: "AI declined this answer. Please mark it yourself.", provider: "claude" };
    }
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text) as Omit<AiSuggestion, "provider">;
    return {
      transcript: parsed.transcript,
      marks: parsed.marks == null ? null : clampMarks(parsed.marks, q.maxMarks),
      matchedPoints: parsed.matchedPoints ?? [],
      missingPoints: parsed.missingPoints ?? [],
      reason: parsed.reason ?? "",
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      provider: "claude",
    };
  }

  async tutorReply(input: TutorTurnInput): Promise<string> {
    const lang = input.language === "ROMAN_URDU" ? "simple Roman Urdu (Urdu written in English letters)" : "simple English";
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

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: `Homework question: ${input.question}` }];
    for (const m of input.history) {
      messages.push({ role: m.role === "student" ? "user" : "assistant", content: m.text });
    }
    if (messages[messages.length - 1].role === "assistant") {
      messages.push({ role: "user", content: "Please continue." });
    }

    const response = await this.client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system,
      messages,
    });
    if (response.stop_reason === "refusal") {
      return input.language === "ROMAN_URDU"
        ? "Is baare mein main madad nahi kar sakta. Chalo homework par wapas aate hain."
        : "I can't help with that. Let's get back to the homework.";
    }
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }
}

let override: LearningAiProvider | null = null;

/** Tests call this to force a provider. */
export function setLearningAiProvider(p: LearningAiProvider | null) {
  override = p;
}

export function getLearningAi(): LearningAiProvider {
  if (override) return override;
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && process.env.NODE_ENV !== "test") return new ClaudeLearningAi(key);
  return new DemoLearningAi();
}
