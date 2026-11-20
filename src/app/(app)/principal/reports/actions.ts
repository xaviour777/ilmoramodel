"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { REPORT } from "@/lib/reports/catalog";
import { filterQuery, readFilters } from "@/lib/reports/run";
import { askReports as ask } from "@/lib/reports/ask";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const who = () => requireRole("principal", "owner", "accountant");

export async function saveView(f: FormData) {
  await who();
  const r = REPORT.get(str(f, "report_id"));
  if (!r) redirect("/principal/reports");
  let raw: Record<string, string> = {};
  try { raw = JSON.parse(str(f, "filters") || "{}"); } catch { /* keep empty */ }
  const filters = readFilters(r, { ...raw, month: raw.month?.slice(0, 7) });
  const supabase = await createClient();
  const { error } = await supabase.from("report_saved").insert({ report_id: r.id, name: str(f, "name").slice(0, 80) || r.name, filters });
  redirect(`/principal/reports?${filterQuery(r, filters, error ? {} : { saved: "1" })}`);
}

export async function deleteSaved(f: FormData) {
  await who();
  const supabase = await createClient();
  await supabase.from("report_saved").delete().eq("id", str(f, "id"));
  redirect("/principal/reports?tab=saved");
}

export async function askReports(f: FormData) {
  await who();
  const question = (str(f, "suggest") || str(f, "question")).slice(0, 400);
  if (question.length < 3) redirect("/principal/reports?tab=ask&error=" + encodeURIComponent("Write a question first."));
  const supabase = await createClient();
  const res = await ask(supabase, question);
  const { data } = await supabase.from("report_runs").insert({
    report_id: res.report.id, filters: res.filters, via: "ask", question, answer: res.answer, row_count: res.rows.length,
  }).select("id").single();
  redirect(`/principal/reports?tab=ask${data ? `&run=${data.id}` : ""}`);
}
