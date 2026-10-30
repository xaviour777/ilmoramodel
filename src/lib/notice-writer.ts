/**
 * AI notice writer for the principal: a few words in, a ready notice out.
 * Uses Claude only when ANTHROPIC_API_KEY is set; otherwise a plain template ("Demo AI").
 * Only the principal's few words and the school name are sent; never student or parent data.
 */
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/ai";

export type NoticeLanguage = "en" | "roman_urdu";
export type NoticeDraft = { title: string; body: string; provider: "demo" | "claude" };

const SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, body: { type: "string" } },
  required: ["title", "body"],
  additionalProperties: false,
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function demoNotice(idea: string, lang: NoticeLanguage, school: string): NoticeDraft {
  const words = idea.trim().replace(/\.$/, "");
  const title = cap(words.length > 60 ? words.slice(0, 57).trimEnd() + "..." : words);
  const body = lang === "roman_urdu"
    ? `Mohtaram walidain,\n\nAap ko itla di jati hai ke ${words}.\n\nBaraye meharbani is ka khayal rakhein. Kisi sawal ke liye school office se raabta karein.\n\nShukriya,\nPrincipal, ${school}`
    : `Dear parents,\n\nThis is to inform you that ${words}.\n\nPlease make a note of this. For any question, contact the school office.\n\nThank you,\nPrincipal, ${school}`;
  return { title, body, provider: "demo" };
}

export async function writeNotice(idea: string, lang: NoticeLanguage, school: string): Promise<NoticeDraft> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || process.env.NODE_ENV === "test") return demoNotice(idea, lang, school);
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: `You write short school notices for ${school}, a private school in Pakistan, sent to parents in the app and on WhatsApp/SMS. `
      + `Polite, clear, under 90 words, no emojis, no made-up dates, fees or names: use only what the principal gave. `
      + (lang === "roman_urdu" ? "Write in simple Roman Urdu (Urdu in English letters)." : "Write in simple English.")
      + " Sign off as Principal. The title is under 60 characters.",
    messages: [{ role: "user", content: `What the notice is about: ${idea}` }],
  });
  if (response.stop_reason === "refusal") return demoNotice(idea, lang, school);
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text) as { title: string; body: string };
  return { title: parsed.title, body: parsed.body, provider: "claude" };
}
