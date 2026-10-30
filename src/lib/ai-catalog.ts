/**
 * The AI companies a school can connect, with suggested models and their list prices.
 * Prices are US dollars per 1 million tokens and only fill the form: the principal can change
 * them, and the daily budget is counted with whatever is saved.
 * The edge function in supabase/functions/ai keeps the same provider ids and addresses.
 */
export type AiProviderId = "claude" | "openai" | "gemini" | "deepseek" | "qwen" | "mistral" | "grok" | "openrouter";

export type AiModel = { id: string; label: string; priceIn: number; priceOut: number; vision: boolean };

export type AiProvider = { id: AiProviderId; label: string; keyHint: string; keyUrl: string; models: AiModel[] };

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: "claude", label: "Claude (Anthropic)", keyHint: "sk-ant-...", keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (cheapest, good for daily work)", priceIn: 0.1, priceOut: 0.5, vision: true },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (better marking)", priceIn: 2, priceOut: 10, vision: true },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5 (best, costly)", priceIn: 4, priceOut: 20, vision: true },
    ],
  },
  {
    id: "openai", label: "ChatGPT (OpenAI)", keyHint: "sk-...", keyUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-5-nano", label: "GPT-5 nano", priceIn: 0.05, priceOut: 0.4, vision: true },
      { id: "gpt-5-mini", label: "GPT-5 mini", priceIn: 0.25, priceOut: 2, vision: true },
      { id: "gpt-5", label: "GPT-5", priceIn: 1.25, priceOut: 10, vision: true },
    ],
  },
  {
    id: "gemini", label: "Gemini (Google)", keyHint: "AIza...", keyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", priceIn: 0.1, priceOut: 0.4, vision: true },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", priceIn: 0.3, priceOut: 2.5, vision: true },
    ],
  },
  {
    id: "deepseek", label: "DeepSeek", keyHint: "sk-...", keyUrl: "https://platform.deepseek.com/api_keys",
    models: [{ id: "deepseek-chat", label: "DeepSeek chat (text only)", priceIn: 0.28, priceOut: 0.42, vision: false }],
  },
  {
    id: "qwen", label: "Qwen (Alibaba)", keyHint: "sk-...", keyUrl: "https://bailian.console.alibabacloud.com/",
    models: [
      { id: "qwen-flash", label: "Qwen Flash (text only)", priceIn: 0.05, priceOut: 0.4, vision: false },
      { id: "qwen-plus", label: "Qwen Plus (text only)", priceIn: 0.4, priceOut: 1.2, vision: false },
      { id: "qwen-vl-plus", label: "Qwen VL Plus (reads photos)", priceIn: 0.21, priceOut: 0.63, vision: true },
    ],
  },
  {
    id: "mistral", label: "Mistral", keyHint: "", keyUrl: "https://console.mistral.ai/api-keys",
    models: [{ id: "mistral-small-latest", label: "Mistral Small", priceIn: 0.1, priceOut: 0.3, vision: true }],
  },
  {
    id: "grok", label: "Grok (xAI)", keyHint: "xai-...", keyUrl: "https://console.x.ai/",
    models: [{ id: "grok-4-fast-non-reasoning", label: "Grok 4 Fast", priceIn: 0.2, priceOut: 0.5, vision: true }],
  },
  {
    id: "openrouter", label: "OpenRouter (one key, hundreds of models)", keyHint: "sk-or-...", keyUrl: "https://openrouter.ai/keys",
    models: [{ id: "openai/gpt-5-mini", label: "Any OpenRouter model, e.g. openai/gpt-5-mini", priceIn: 0.25, priceOut: 2, vision: true }],
  },
];

export const providerById = (id: string) => AI_PROVIDERS.find((p) => p.id === id);
export const modelInfo = (provider: string, model: string) => providerById(provider)?.models.find((m) => m.id === model);

// What each AI job is called on the usage screen.
export const AI_FEATURES: Record<string, string> = {
  tutor: "Homework tutor",
  marks: "Paper checking",
  notice: "Notice writer",
};

// Dollars to rupees for showing the budget; only a guide.
export const PKR_PER_USD = 280;
