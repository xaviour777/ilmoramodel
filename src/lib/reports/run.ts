import type { SupabaseClient } from "@supabase/supabase-js";
import { pct, rupees, todayPK } from "@/lib/format";
import { RETIRES, type Col, type FilterKey, type Report } from "./catalog";

export type Filters = Partial<Record<"from" | "to" | "month" | "class" | "section" | "status" | "gender" | "exam" | "van" | "route" | "category" | "days" | "min" | "top", string>>;
export type Row = Record<string, unknown>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Filters from the address bar, checked and filled with the report's defaults.
export function readFilters(r: Report, sp: Record<string, string | undefined>): Filters {
  const f: Filters = {};
  const has = (k: FilterKey) => r.filters?.includes(k);
  const today = todayPK();
  if (has("dates")) {
    const def = r.dates ?? "month";
    const from = sp.from && DATE.test(sp.from) ? sp.from : def === "year" ? `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0)}-04-01` : def === "all" ? "" : today.slice(0, 8) + "01";
    const to = sp.to && DATE.test(sp.to) ? sp.to : today;
    if (from) f.from = from;
    f.to = from && to < from ? from : to;
  }
  if (has("day")) f.to = sp.to && DATE.test(sp.to) ? sp.to : today;
  if (has("month")) f.month = (sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7)) + "-01";
  for (const k of ["class", "section", "exam", "van", "route", "category"] as const) if (has(k) && sp[k] && UUID.test(sp[k]!)) f[k] = sp[k];
  if (has("status")) { const v = sp.status ?? r.status?.def ?? ""; if (r.status?.options.some(([o]) => o === v)) f.status = v; }
  if (has("gender") && (sp.gender === "male" || sp.gender === "female")) f.gender = sp.gender;
  for (const k of ["days", "min", "top"] as const) if (has(k) && sp[k] && /^\d{1,4}$/.test(sp[k]!)) f[k] = sp[k];
  return f;
}

export async function runReport(supabase: SupabaseClient, r: Report, f: Filters): Promise<{ rows: Row[]; error?: string }> {
  if (r.link) return { rows: [] };
  if (r.filters?.includes("exam") && !f.exam) return { rows: [], error: "Choose an exam first." };
  const { data, error } = await supabase.rpc("report_rows", { p_report: r.id, p_f: f });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as Row[] };
}

// Columns to show: drop those a filter has fixed, and those empty in every row.
export function visibleCols(r: Report, f: Filters, rows: Row[]): Col[] {
  const retired = new Set<string>();
  for (const [k, cols] of Object.entries(RETIRES)) if (f[k as keyof Filters]) for (const c of cols!) retired.add(c);
  return r.cols.filter((c) => !retired.has(c.k) && (rows.length === 0 || rows.some((x) => x[c.k] != null && x[c.k] !== "")));
}

const LABEL: Record<string, string> = { enrolled: "Studying", left: "Left", struck_off: "Struck off", passed_out: "Passed out", jazzcash: "JazzCash", easypaisa: "Easypaisa", cash: "Cash", male: "Boy", female: "Girl", M: "Boy", F: "Girl" };

export function cell(c: Col, v: unknown): string {
  if (v == null || v === "") return "";
  switch (c.t) {
    case "money": return rupees(Number(v));
    case "pct": return pct(Number(v), Number(v) < 1 && Number(v) > 0 ? 1 : 0);
    case "int": return Number(v).toLocaleString("en-IN");
    case "num": return String(Math.round(Number(v) * 100) / 100);
    case "date": return new Date(String(v).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    default: return LABEL[String(v)] ?? String(v);
  }
}

// a totals line for money and count columns (not for rates or rolls)
export function totals(cols: Col[], rows: Row[]): string[] | null {
  if (rows.length < 2 || !cols.some((c) => c.t === "money" || c.t === "int")) return null;
  const skip = new Set(["age", "year", "class", "position", "days_left", "days_waiting", "turns", "capacity", "seats", "odometer"]);
  return cols.map((c, i) => {
    if (i === 0) return "Total";
    if ((c.t === "money" || c.t === "int") && !skip.has(c.k)) return cell(c, rows.reduce((t, x) => t + Number(x[c.k] ?? 0), 0));
    return "";
  });
}

export function toCsv(cols: Col[], rows: Row[]): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const raw = (c: Col, v: unknown) => v == null ? "" : c.t === "money" ? String(Math.round(Number(v)) / 100) : c.t === "pct" ? String(Math.round(Number(v) * 1000) / 10) : c.t === "date" ? String(v).slice(0, 10) : cell(c, v);
  const head = cols.map((c) => q(c.l + (c.t === "money" ? " (Rs)" : c.t === "pct" ? " (%)" : "")));
  return "﻿" + [head.join(","), ...rows.map((x) => cols.map((c) => q(raw(c, x[c.k]))).join(","))].join("\r\n");
}

export function filterQuery(r: Report, f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ r: r.id });
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, k === "month" ? v.slice(0, 7) : v);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}
