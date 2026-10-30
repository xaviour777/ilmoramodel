import { SettingsTabs } from "@/components/settings-tabs";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { allRows } from "@/lib/outbox";
import { todayPK } from "@/lib/format";
import { aiStatus } from "@/lib/ai";
import { AI_FEATURES, AI_PROVIDERS, PKR_PER_USD, providerById } from "@/lib/ai-catalog";
import { saveAi, setBudget, testAi } from "./actions";

type Search = { saved?: string; tested?: string; error?: string };
type Use = { at: string; feature: string; cost_usd: number; ok: boolean };

const usd = (n: number) => `$${n < 0.1 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
const pkr = (n: number) => `Rs ${Math.round(n * PKR_PER_USD).toLocaleString("en-PK")}`;
const pkDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

export default async function AiSettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const monthStart = `${today.slice(0, 7)}-01T00:00:00+05:00`;
  const [{ data: s }, { data: keys }, status, uses] = await Promise.all([
    supabase.from("ai_settings").select("enabled, provider, model, price_in_usd, price_out_usd, vision, daily_budget_usd").maybeSingle(),
    supabase.from("ai_keys").select("provider, api_key"),
    aiStatus(supabase),
    allRows<Use>((a, b) => supabase.from("ai_usage").select("at, feature, cost_usd, ok").gte("at", monthStart).order("at").range(a, b)),
  ]);
  const provider = s?.provider ?? "claude";
  const p = providerById(provider) ?? AI_PROVIDERS[0];
  const model = s?.model ?? p.models[0].id;
  const budget = Number(s?.daily_budget_usd ?? 1);
  const keyTail = new Map((keys ?? []).map((k) => [k.provider, k.api_key.slice(-4)]));

  const spentToday = status?.spent_today ?? 0;
  const callsToday = uses.filter((u) => pkDay(u.at) === today).length;
  const month = uses.reduce((t, u) => t + Number(u.cost_usd), 0);
  const byFeature = new Map<string, { calls: number; cost: number }>();
  const byDay = new Map<string, number>();
  for (const u of uses) {
    const f = byFeature.get(u.feature) ?? { calls: 0, cost: 0 };
    byFeature.set(u.feature, { calls: f.calls + 1, cost: f.cost + Number(u.cost_usd) });
    byDay.set(pkDay(u.at), (byDay.get(pkDay(u.at)) ?? 0) + Number(u.cost_usd));
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);
  const used = budget > 0 ? Math.min(spentToday / budget, 1) : 1;
  const state = !s?.enabled ? "Off" : !keyTail.has(provider) ? "No key" : spentToday >= budget ? "Limit reached" : "On";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">AI</h1>
          <p className="muted text-base">{me.campus_name}: choose the AI company, paste its key, and set how much it may spend each day. When the limit is reached, AI stops until tomorrow and the app goes back to Demo AI.</p>
        </div>
        <SettingsTabs current="ai" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {sp.tested && <div className="notice-ok">AI answered: &ldquo;{sp.tested}&rdquo;</div>}

      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="h2">Today&apos;s spend</h2>
            <span className={`pill ${state === "On" ? "pill-green" : "pill-gray"}`}>{state}</span>
          </div>
          <div className="text-3xl font-black">{usd(spentToday)} <span className="muted text-base">of {usd(budget)} · {callsToday} calls</span></div>
          <div className="h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
            <div className="h-full rounded-full" style={{ width: `${used * 100}%`, background: used >= 1 ? "var(--red)" : "var(--blue-ring)" }} />
          </div>
          <p className="muted text-sm">Daily limit {usd(budget)} ≈ {pkr(budget)} a day, {pkr(budget * 30)} a month at most. This month so far: {usd(month)} ≈ {pkr(month)}.</p>
          <form action={setBudget} className="flex flex-wrap items-end gap-2">
            {[0.5, 1, 2, 5].map((v) => (
              <button key={v} name="budget" value={v} className={`btn-ghost ${v === budget ? "font-black" : ""}`}>{usd(v)}/day</button>
            ))}
          </form>
          <form action={setBudget} className="flex items-end gap-2">
            <label className="field">Your own limit ($ per day)<input className="input" name="budget" type="number" min="0" max="1000" step="0.01" defaultValue={budget} /></label>
            <button className="btn">Set limit</button>
          </form>
        </section>

        <section className="card">
          <h2 className="h2">This month by job</h2>
          {byFeature.size === 0 && <p className="muted">No AI calls this month yet.</p>}
          <table className="w-full text-sm">
            <tbody>
              {[...byFeature.entries()].map(([f, v]) => (
                <tr key={f} className="border-b" style={{ borderColor: "var(--line)" }}>
                  <td className="py-1.5 font-bold">{AI_FEATURES[f] ?? f}</td><td>{v.calls} calls</td><td className="text-right">{usd(v.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {days.length > 0 && (
            <>
              <h3 className="eyebrow mt-2">Last days</h3>
              <table className="w-full text-sm">
                <tbody>
                  {days.map(([d, c]) => (
                    <tr key={d}><td className="py-1">{d}</td><td className="text-right">{usd(c)}{c >= budget ? " · limit reached" : ""}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className="card xl:col-span-2">
          <h2 className="h2">AI company and model</h2>
          <form action={saveAi} className="flex flex-col gap-3">
            <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="enabled" defaultChecked={s?.enabled ?? false} className="h-5 w-5" /> Use real AI (homework tutor, paper checking, notice writer)</label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="field">AI company
                <select className="input" name="provider" defaultValue={provider}>
                  {AI_PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.label}{keyTail.has(x.id) ? ` · key ends ${keyTail.get(x.id)}` : ""}</option>)}
                </select>
              </label>
              <label className="field">Model
                <input className="input" name="model" list="ai-models" defaultValue={model} placeholder={p.models[0].id} />
                <datalist id="ai-models">
                  {AI_PROVIDERS.flatMap((x) => x.models.map((m) => <option key={`${x.id}-${m.id}`} value={m.id}>{x.label}: {m.label}</option>))}
                </datalist>
              </label>
            </div>
            <label className="field">API key for the company above ({keyTail.has(provider) ? `saved, ends in ${keyTail.get(provider)}` : "not saved"})
              <input className="input" name="api_key" type="password" autoComplete="off" placeholder="Paste to save or replace" />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="clear_key" /> Remove the saved key for this company</label>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="field">Input price ($ per 1M tokens)<input className="input" name="price_in" inputMode="decimal" defaultValue={s ? String(s.price_in_usd) : ""} placeholder="blank = list price" /></label>
              <label className="field">Output price ($ per 1M tokens)<input className="input" name="price_out" inputMode="decimal" defaultValue={s ? String(s.price_out_usd) : ""} placeholder="blank = list price" /></label>
              <label className="field">Daily limit ($)<input className="input" name="budget" type="number" min="0" max="1000" step="0.01" defaultValue={budget} /></label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="vision" defaultChecked={s?.vision ?? true} /> This model can read photos (only asked for a model not in the list below)</label>
            <p className="muted text-sm">When you change the model, clear both price boxes so the list price for the new model is used. Check prices on the company&apos;s website; they change.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn">Save</button>
            </div>
          </form>
          <form action={testAi}><button className="btn-ghost">Send a test question</button></form>

          <details className="text-sm">
            <summary className="eyebrow cursor-pointer">Models and list prices</summary>
            <table className="mt-2 w-full">
              <thead><tr className="text-left"><th>Company</th><th>Model</th><th>In / Out ($ per 1M)</th><th>Photos</th></tr></thead>
              <tbody>
                {AI_PROVIDERS.flatMap((x) => x.models.map((m) => (
                  <tr key={`${x.id}-${m.id}`} className="border-b" style={{ borderColor: "var(--line)" }}>
                    <td className="py-1">{x.label}</td><td><code>{m.id}</code></td><td>{m.priceIn} / {m.priceOut}</td><td>{m.vision ? "Yes" : "No"}</td>
                  </tr>
                )))}
              </tbody>
            </table>
            <p className="mt-2">Where to get a key: {AI_PROVIDERS.map((x, i) => <span key={x.id}>{i ? " · " : ""}<a className="underline" href={x.keyUrl} target="_blank" rel="noreferrer">{x.label}</a></span>)}</p>
            <p className="mt-1">A homework tutor reply or a notice costs about 1,000 to 3,000 tokens. On Claude Haiku 5.5 that is less than a tenth of a cent, so $1 a day covers about 2,000 replies.</p>
          </details>
        </section>
      </div>
    </>
  );
}
