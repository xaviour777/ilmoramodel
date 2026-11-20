/**
 * "Ask" in the Report Center: a plain question in, an answer from the school's own reports out.
 * Step 1 picks a report and its filters (AI when it is on, otherwise word matching).
 * Step 2 runs that report as the signed-in person, so they only ever see what they may see.
 * Step 3 (AI only) writes a short answer from those rows. Phone numbers, CNICs and B-form numbers
 * are removed before anything is sent to the AI.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { callAi } from "@/lib/ai";
import { todayPK } from "@/lib/format";
import { CATEGORIES, REPORT, REPORTS, type Report } from "./catalog";
import { cell, readFilters, runReport, visibleCols, type Filters, type Row } from "./run";

export type AskResult = { report: Report; filters: Filters; rows: Row[]; answer: string; provider: string };

const PRIVATE = new Set(["phone", "cnic", "b_form", "sender_phone", "txn_id", "father_cnic"]);

const PICK_SCHEMA = {
  type: "object",
  properties: {
    report_id: { type: "string" },
    from: { type: ["string", "null"] }, to: { type: ["string", "null"] }, month: { type: ["string", "null"] },
    class_name: { type: ["string", "null"] }, section_name: { type: ["string", "null"] }, exam_name: { type: ["string", "null"] },
    status: { type: ["string", "null"] }, gender: { type: ["string", "null"] }, min: { type: ["number", "null"] }, top: { type: ["number", "null"] }, days: { type: ["number", "null"] },
  },
  required: ["report_id", "from", "to", "month", "class_name", "section_name", "exam_name", "status", "gender", "min", "top", "days"],
  additionalProperties: false,
};

// words people use for each report, in English and Roman Urdu, for when AI is off
const HINTS: Record<string, string> = {
  "fee-defaulters": "defaulter owe owing due baqaya baqi fees not paid nahi di balance",
  "fee-by-mode": "cash jazzcash easypaisa mode kitni aayi collection collected received wasooli",
  "fee-receipts": "receipt receipts register",
  "fee-collection-class": "collection class rate billed",
  "att-chronic-absent": "absent ghair hazir chutti often missing days",
  "att-not-marked": "not marked attendance register empty lagayi nahi",
  "att-daily-register": "today aaj attendance hazri",
  "student-withdrawn": "left chor gaye withdrawn struck passed out nikal",
  "exam-toppers": "top topper position first best",
  "exam-failures": "fail failed failing",
  "student-roster": "list directory students bachay",
  "class-strength": "strength capacity seats kitne bachay class",
  "birthdays": "birthday salgirah",
  "admissions-pipeline": "admission inquiry dakhla",
  "income-expense": "profit loss p&l income kharcha munafa",
  "expenses-by-category": "expense kharch category",
  "payroll-month": "salary tankhwah payroll",
  "transport-students": "van bus transport route",
  "teacher-load": "teacher periods load workload",
  "documents-expiring": "document expire expiry",
};

function wordPick(q: string): Report {
  const words = q.toLowerCase().split(/[^a-z0-9&]+/).filter((w) => w.length > 2);
  let best: Report = REPORT.get("student-roster")!, score = 0;
  for (const r of REPORTS) {
    if (r.link) continue;
    const hay = `${r.name} ${r.desc} ${HINTS[r.id] ?? ""}`.toLowerCase();
    const s = words.reduce((t, w) => t + (hay.includes(w) ? (HINTS[r.id]?.includes(w) ? 3 : 1) : 0), 0);
    if (s > score) { best = r; score = s; }
  }
  return best;
}

async function names(supabase: SupabaseClient) {
  const [{ data: secs }, { data: exams }] = await Promise.all([
    supabase.from("sections").select("id, name, classes(id, name)"),
    supabase.from("exams").select("id, name, starts_on").in("status", ["marks_entry", "results"]).order("starts_on", { ascending: false }).limit(20),
  ]);
  const s = (secs ?? []) as unknown as { id: string; name: string; classes: { id: string; name: string } }[];
  return { secs: s, exams: exams ?? [] };
}

export async function askReports(supabase: SupabaseClient, question: string): Promise<AskResult> {
  const today = todayPK();
  const { secs, exams } = await names(supabase);
  const catalog = REPORTS.filter((r) => !r.link).map((r) => `${r.id}: ${r.name}. ${r.desc} [filters: ${(r.filters ?? []).join(", ") || "none"}]${r.status ? ` [status: ${r.status.options.map(([v]) => v).join("/")}]` : ""}`).join("\n");
  const classes = [...new Set(secs.map((x) => x.classes.name))];

  // 1. choose the report and filters
  let report = wordPick(question);
  let sp: Record<string, string | undefined> = {};
  let provider = "demo";
  const pick = await callAi(supabase, {
    feature: "ask", maxTokens: 400, schema: PICK_SCHEMA,
    system: `You route a Pakistani school principal's question to one report from this list. Today is ${today}. The school year starts in April.\n`
      + `Reports (id: name. description [filters]):\n${catalog}\n\nClasses: ${classes.join(", ")}. Sections look like "Class 9-A". Recent exams: ${exams.map((e) => e.name).join(", ") || "none"}.\n`
      + `Use dates as YYYY-MM-DD and month as YYYY-MM. Use null for anything the question does not say. min is rupees for fee-defaulters, days for att-chronic-absent. Questions may be in English, Urdu or Roman Urdu.`,
    messages: [{ role: "user", text: question }],
  });
  if (pick.ok) {
    try {
      const p = JSON.parse(pick.text) as Record<string, string | number | null>;
      const r = REPORT.get(String(p.report_id));
      if (r && !r.link) {
        report = r; provider = pick.provider;
        const sec = p.section_name ? secs.find((x) => `${x.classes.name}-${x.name}`.toLowerCase() === String(p.section_name).toLowerCase().replace(/\s*-\s*/, "-")) : undefined;
        const cls = p.class_name ? secs.find((x) => x.classes.name.toLowerCase() === String(p.class_name).toLowerCase()) : undefined;
        const ex = p.exam_name ? exams.find((e) => e.name.toLowerCase().includes(String(p.exam_name).toLowerCase())) : undefined;
        sp = {
          from: p.from ? String(p.from) : undefined, to: p.to ? String(p.to) : undefined, month: p.month ? String(p.month) : undefined,
          section: sec?.id, class: sec ? undefined : cls?.classes.id, exam: ex?.id,
          status: p.status ? String(p.status) : undefined, gender: p.gender ? String(p.gender) : undefined,
          min: p.min != null ? String(Math.round(Number(p.min))) : undefined, top: p.top != null ? String(Math.round(Number(p.top))) : undefined, days: p.days != null ? String(Math.round(Number(p.days))) : undefined,
        };
      }
    } catch { /* fall back to word matching */ }
  }
  if (report.filters?.includes("exam") && !sp.exam && exams[0]) sp.exam = exams[0].id;
  const filters = readFilters(report, sp);
  const { rows, error } = await runReport(supabase, report, filters);
  if (error) return { report, filters, rows, answer: error, provider };

  // 2. answer in words
  const cols = visibleCols(report, filters, rows).filter((c) => !PRIVATE.has(c.k));
  const period = filters.from ? ` from ${filters.from} to ${filters.to}` : filters.to ? ` for ${filters.to}` : "";
  const plain = `“${report.name}”${period}: ${rows.length} row${rows.length === 1 ? "" : "s"}.`
    + (rows.length ? `\nFirst: ${cols.slice(0, 4).map((c) => `${c.l} ${cell(c, rows[0][c.k])}`).join(", ")}.` : "");
  if (!pick.ok || !rows.length) return { report, filters, rows, answer: (pick.ok ? "" : "AI is off, so here is the closest report. ") + plain, provider };
  const sample = rows.slice(0, 60).map((x) => Object.fromEntries(cols.map((c) => [c.l, cell(c, x[c.k])])));
  const ans = await callAi(supabase, {
    feature: "ask", maxTokens: 600,
    system: `You answer a school principal in 2 to 5 short sentences, in the same language as the question (English, Urdu or Roman Urdu). `
      + `Use only the rows given. Give the key numbers. If the rows are cut short (${rows.length} rows in total), say the full list is in the report. Do not invent anything.`,
    messages: [{ role: "user", text: `Question: ${question}\nReport: ${report.name} (${CATEGORIES.find(([id]) => id === report.cat)?.[1]})${period}\nRows (${rows.length} total, first ${sample.length}):\n${JSON.stringify(sample)}` }],
  });
  return { report, filters, rows, answer: ans.ok ? ans.text : plain, provider: ans.ok ? ans.provider : provider };
}
