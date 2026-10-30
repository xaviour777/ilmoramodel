// Every AI call in Ilmora goes through here. It checks who is asking, keeps the campus inside
// its daily budget, calls the AI company the principal chose, and writes down the cost.
// The API key is read with the service role and never leaves this function.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";

type Msg = { role: "user" | "assistant"; text: string };
type Body = { feature: string; system?: string; messages: Msg[]; image?: string | null; schema?: Record<string, unknown> | null; maxTokens?: number };
type Result = { text: string; inputTokens: number; outputTokens: number; refused?: boolean };

// Who may use which AI job.
const FEATURE_ROLES: Record<string, string[]> = {
  tutor: ["student", "parent", "teacher", "principal", "owner"],
  marks: ["teacher", "principal", "owner"],
  notice: ["principal", "owner"],
};

// Companies that speak the OpenAI chat format, and where.
const OPENAI_STYLE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  deepseek: "https://api.deepseek.com/v1",
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  mistral: "https://api.mistral.ai/v1",
  grok: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function callClaude(key: string, model: string, b: Body, maxTokens: number): Promise<Result> {
  const client = new Anthropic({ apiKey: key });
  const messages: Anthropic.MessageParam[] = b.messages.map((m, i) => ({
    role: m.role,
    content: i === 0 && b.image
      ? [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.image } }, { type: "text", text: m.text }]
      : m.text,
  }));
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: b.system,
    messages,
    output_config: { effort: "low", ...(b.schema ? { format: { type: "json_schema", schema: b.schema } } : {}) },
  });
  const text = response.content.filter((x): x is Anthropic.TextBlock => x.type === "text").map((x) => x.text).join("\n").trim();
  return {
    text,
    inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
    refused: response.stop_reason === "refusal",
  };
}

async function callOpenAiStyle(provider: string, key: string, model: string, b: Body, maxTokens: number): Promise<Result> {
  const system = [b.system, b.schema ? `Reply with only one JSON object that follows this JSON schema, nothing else:\n${JSON.stringify(b.schema)}` : ""]
    .filter(Boolean).join("\n\n");
  const messages: unknown[] = system ? [{ role: "system", content: system }] : [];
  b.messages.forEach((m, i) => {
    messages.push({
      role: m.role,
      content: i === 0 && b.image
        ? [{ type: "text", text: m.text }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b.image}` } }]
        : m.text,
    });
  });
  const body: Record<string, unknown> = { model, messages };
  // OpenAI's newer models only take max_completion_tokens; the others take max_tokens.
  body[provider === "openai" ? "max_completion_tokens" : "max_tokens"] = maxTokens;
  if (b.schema) body.response_format = { type: "json_object" };
  const res = await fetch(`${OPENAI_STYLE[provider]}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `${provider} answered ${res.status}`);
  const choice = data.choices?.[0];
  let text = String(choice?.message?.content ?? "").trim();
  // some models wrap JSON in a code fence
  if (b.schema) text = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  return {
    text,
    inputTokens: Number(data.usage?.prompt_tokens ?? 0),
    outputTokens: Number(data.usage?.completion_tokens ?? 0),
    refused: choice?.finish_reason === "content_filter",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply("ok");
  if (req.method !== "POST") return reply({ ok: false, reason: "error", message: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return reply({ ok: false, reason: "error", message: "Sign in again." }, 401);
  const { data: me } = await service.from("profiles").select("id, role, campus_id").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (!me) return reply({ ok: false, reason: "error", message: "No profile." }, 403);

  let b: Body;
  try {
    b = await req.json();
  } catch {
    return reply({ ok: false, reason: "error", message: "Bad request." }, 400);
  }
  if (!FEATURE_ROLES[b.feature]?.includes(me.role)) return reply({ ok: false, reason: "error", message: "Not allowed." }, 403);
  if (!Array.isArray(b.messages) || !b.messages.length || b.messages.some((m) => typeof m.text !== "string" || m.text.length > 8000)) {
    return reply({ ok: false, reason: "error", message: "Bad request." }, 400);
  }
  if (b.image && (typeof b.image !== "string" || b.image.length > 1_500_000)) b.image = null;

  const { data: s } = await service.from("ai_settings").select("*").eq("campus_id", me.campus_id).maybeSingle();
  if (!s?.enabled) return reply({ ok: false, reason: "off" });
  const { data: k } = await service.from("ai_keys").select("api_key").eq("campus_id", me.campus_id).eq("provider", s.provider).maybeSingle();
  if (!k?.api_key) return reply({ ok: false, reason: "off" });
  const { data: spent } = await service.rpc("ai_spent_today", { p_campus: me.campus_id });
  if (Number(spent ?? 0) >= Number(s.daily_budget_usd)) return reply({ ok: false, reason: "budget" });
  if (!s.vision) b.image = null;

  const maxTokens = Math.min(Math.max(Number(b.maxTokens) || 1500, 256), 8000);
  const log = (r: Partial<Result>, ok: boolean) => {
    const cost = ((r.inputTokens ?? 0) * Number(s.price_in_usd) + (r.outputTokens ?? 0) * Number(s.price_out_usd)) / 1_000_000;
    return service.from("ai_usage").insert({
      campus_id: me.campus_id, feature: b.feature, provider: s.provider, model: s.model,
      input_tokens: r.inputTokens ?? 0, output_tokens: r.outputTokens ?? 0, cost_usd: cost, ok, profile_id: me.id,
    });
  };
  try {
    const r = s.provider === "claude"
      ? await callClaude(k.api_key, s.model, b, maxTokens)
      : OPENAI_STYLE[s.provider]
        ? await callOpenAiStyle(s.provider, k.api_key, s.model, b, maxTokens)
        : null;
    if (!r) return reply({ ok: false, reason: "off" });
    await log(r, !r.refused);
    if (r.refused || !r.text) return reply({ ok: false, reason: "refused" });
    return reply({ ok: true, text: r.text, provider: s.provider, model: s.model, vision: s.vision });
  } catch (e) {
    await log({}, false);
    // never echo the key back if a company puts it in an error
    const message = (e instanceof Error ? e.message : "AI error").replaceAll(k.api_key, "***").slice(0, 300);
    return reply({ ok: false, reason: "error", message });
  }
});
