import type { SupabaseClient } from "@supabase/supabase-js";
import type { Report } from "./catalog";

export type Opt = [string, string];
export type Options = Partial<Record<"class" | "section" | "exam" | "van" | "route" | "category", Opt[]>>;

// Choices for the filters a report uses (only those it needs are loaded).
export async function loadOptions(supabase: SupabaseClient, r: Report): Promise<Options> {
  const need = new Set(r.filters ?? []);
  const out: Options = {};
  const jobs: PromiseLike<void>[] = [];
  if (need.has("class") || need.has("section")) jobs.push(supabase.from("sections").select("id, name, classes(id, name, sort)").then(({ data }) => {
    type S = { id: string; name: string; classes: { id: string; name: string; sort: number } };
    const secs = ((data ?? []) as unknown as S[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
    out.section = secs.map((s) => [s.id, `${s.classes.name}-${s.name}`]);
    out.class = [...new Map(secs.map((s) => [s.classes.id, s.classes.name])).entries()];
  }));
  if (need.has("exam")) jobs.push(supabase.from("exams").select("id, name, starts_on, status").in("status", ["marks_entry", "results"]).order("starts_on", { ascending: false }).limit(60).then(({ data }) => {
    out.exam = (data ?? []).map((e) => [e.id, `${e.name}${e.status === "results" ? "" : " (marks being entered)"}`]);
  }));
  if (need.has("van")) jobs.push(supabase.from("vans").select("id, name").order("name").then(({ data }) => { out.van = (data ?? []).map((v) => [v.id, v.name]); }));
  if (need.has("route")) jobs.push(supabase.from("transport_routes").select("id, name").order("name").then(({ data }) => { out.route = (data ?? []).map((v) => [v.id, v.name]); }));
  if (need.has("category")) jobs.push(supabase.from("expense_categories").select("id, name, parent_id").eq("is_active", true).order("sort").then(({ data }) => {
    out.category = (data ?? []).filter((c) => !c.parent_id).map((c) => [c.id, c.name]);
  }));
  await Promise.all(jobs);
  return out;
}
