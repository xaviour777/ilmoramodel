import { createClient } from "@/lib/supabase/server";
import { todayPK } from "@/lib/format";

export type Period = "week" | "month" | "term" | "year";
export const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "This week" }, { id: "month", label: "This month" }, { id: "term", label: "This term" }, { id: "year", label: "This year" },
];
export type OwnerSearch = { c?: string; p?: string };

// Date range for a period, Pakistan time. "Term" is the last three months; "year" is the
// school year from 1 April.
export function range(p: Period) {
  const to = todayPK();
  const t = new Date(to + "T00:00:00Z");
  let from: Date;
  if (p === "week") { from = new Date(t); from.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); }
  else if (p === "month") from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  else if (p === "term") from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 2, 1));
  else from = new Date(Date.UTC(t.getUTCMonth() >= 3 ? t.getUTCFullYear() : t.getUTCFullYear() - 1, 3, 1));
  return { from: from.toISOString().slice(0, 10), to };
}

export type CampusRow = {
  id: string; name: string; city: string | null; status: "running" | "opening"; opened_on: string | null; target: number | null;
  principal: string | null; principal_id: string | null; seats: number | null; students: number; sections: number; staff: number;
  billed: number; collected: number; online: number; concessions: number; outstanding: number; owing_families: number;
  expenses: number; payroll: number; att_marked: number; att_present: number; results: number | null; pass: number | null;
  praise: number; complaints: number; inquiries: number; tests: number; offers: number; joined: number; sources: Record<string, number>;
};
export type Scored = CampusRow & { costs: number; profit: number; margin: number | null; att: number | null; colRate: number | null; satisfaction: number | null; fill: number | null; score: number | null };

// Score = results 30% + attendance 20% + fee collection 20% + profit margin 20% + parent satisfaction 10%.
// A part with no data yet is left out and the others are weighted up, so a new campus isn't punished for empty records.
export function score(c: CampusRow): Scored {
  const costs = Number(c.expenses) + Number(c.payroll);
  const profit = Number(c.collected) - costs;
  const margin = Number(c.collected) > 0 ? profit / Number(c.collected) : null;
  const att = c.att_marked ? c.att_present / c.att_marked : null;
  const colRate = Number(c.billed) > 0 ? Math.min(1, Number(c.collected) / Number(c.billed)) : null;
  const satisfaction = c.praise + c.complaints > 0 ? c.praise / (c.praise + c.complaints) : null;
  const fill = c.seats ? c.students / c.seats : null;
  const parts: [number | null, number][] = [
    [c.results == null ? null : Number(c.results), 0.3], [att, 0.2], [colRate, 0.2],
    [margin == null ? null : Math.max(0, Math.min(1, 0.5 + margin * 2)), 0.2], [satisfaction, 0.1],
  ];
  const have = parts.filter(([v]) => v != null);
  const w = have.reduce((t, [, x]) => t + x, 0);
  const s = c.status === "opening" || !c.students || w < 0.4 ? null : Math.round((have.reduce((t, [v, x]) => t + v! * x, 0) / w) * 100);
  return { ...c, costs, profit, margin, att, colRate, satisfaction, fill, score: s };
}

export async function loadGroup(sp: OwnerSearch) {
  const supabase = await createClient();
  const period = (PERIODS.some((x) => x.id === sp.p) ? sp.p : "month") as Period;
  const { from, to } = range(period);
  const { data, error } = await supabase.rpc("owner_campuses", { p_from: from, p_to: to });
  const all = ((data ?? []) as CampusRow[]).map(score);
  const camp = all.find((c) => c.id === sp.c)?.id ?? "all";
  const sel = camp === "all" ? all : all.filter((c) => c.id === camp);
  const sum = (f: (c: Scored) => number) => sel.reduce((t, c) => t + (Number(f(c)) || 0), 0);
  return { supabase, period, from, to, all, sel, camp, sum, error: error?.message ?? null };
}

export const rs = (paisa: number) => {
  const r = Math.round(paisa / 100), a = Math.abs(r), sign = r < 0 ? "− " : "";
  return sign + "Rs " + (a >= 1e6 ? (a / 1e6).toFixed(2) + "M" : a >= 1e4 ? Math.round(a / 1000) + "k" : a.toLocaleString("en-PK"));
};
export const pc = (v: number | null | undefined, d = 0) => (v == null || !isFinite(v) ? "—" : (v * 100).toFixed(d) + "%");
export const qs = (sp: OwnerSearch, o: Partial<OwnerSearch>) => "?" + new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v && v !== "all") as [string, string][]).toString();

// Plain-language notes worked out from the numbers (no guessing: every line comes from the rows).
export function insights(all: Scored[]) {
  const live = all.filter((c) => c.status === "running" && c.students > 0);
  const out: string[] = [];
  for (const c of live) if (c.profit < 0 && c.collected > 0) out.push(`${c.name} is losing ${rs(-c.profit)} in this period${c.fill != null && c.fill < 0.7 ? `, with ${pc(1 - c.fill)} of seats empty` : ""}.`);
  const byCol = live.filter((c) => c.colRate != null).sort((a, b) => a.colRate! - b.colRate!);
  if (byCol.length > 1 && byCol.at(-1)!.colRate! - byCol[0].colRate! >= 0.08)
    out.push(`${byCol[0].name} collects ${pc(byCol[0].colRate)} of fees billed; ${byCol.at(-1)!.name} collects ${pc(byCol.at(-1)!.colRate)}.`);
  for (const c of live) if (c.fill != null && c.fill < 0.6) out.push(`${c.name} has ${Math.max(0, (c.seats ?? 0) - c.students)} empty seats (${pc(c.fill)} full).`);
  for (const c of all) if (c.target && c.joined < c.target * 0.5) out.push(`${c.name} has ${c.joined} of its ${c.target} admissions target in this period.`);
  for (const c of live) if (c.att != null && c.att < 0.88) out.push(`Attendance at ${c.name} is ${pc(c.att, 1)}, below the 90% goal.`);
  for (const c of live) if (c.owing_families > 0 && c.outstanding > c.collected * 0.3 && c.collected > 0) out.push(`${c.name}: ${c.owing_families} families owe ${rs(c.outstanding)}.`);
  return out.slice(0, 6);
}
