"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (error?: string, ok?: string): never => {
  if (error) redirect(`/settings/year?error=${encodeURIComponent(error)}`);
  revalidatePath("/settings/year");
  redirect(`/settings/year${ok ? `?saved=${ok}` : ""}`);
};
const admin = () => requireRole("principal", "owner");
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

// only one session can be current, so the old one is switched off first
async function makeCurrent(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { error } = await supabase.from("academic_sessions").update({ is_current: false }).eq("is_current", true).neq("id", id);
  if (error) return error.message;
  return (await supabase.from("academic_sessions").update({ is_current: true }).eq("id", id)).error?.message;
}

export async function addSession(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const [starts, ends] = [str(f, "starts_on"), str(f, "ends_on")];
  if (!str(f, "name") || !isDate(starts) || !isDate(ends) || ends <= starts) back("Give the year a name, and an end date after the start date.");
  const { data, error } = await supabase.from("academic_sessions")
    .insert({ campus_id: me.campus_id, name: str(f, "name"), starts_on: starts, ends_on: ends }).select("id").single();
  if (error || !data) back(error?.message ?? "Could not save.");
  back(f.get("current") === "on" ? await makeCurrent(supabase, data!.id) : undefined, "session");
}

export async function setCurrentSession(f: FormData) {
  await admin();
  const supabase = await createClient();
  back(await makeCurrent(supabase, str(f, "session_id")), "session");
}

export async function addTerm(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const [starts, ends] = [str(f, "starts_on"), str(f, "ends_on")];
  if (!str(f, "name") || !isDate(starts) || !isDate(ends) || ends < starts) back("Give the term a name and its dates.");
  const { count } = await supabase.from("terms").select("id", { count: "exact", head: true }).eq("session_id", str(f, "session_id"));
  const { error } = await supabase.from("terms").insert({
    campus_id: me.campus_id, session_id: str(f, "session_id"), name: str(f, "name"), starts_on: starts, ends_on: ends, sort: (count ?? 0) + 1,
  });
  back(error?.message, "term");
}

export async function deleteTerm(f: FormData) {
  await admin();
  const supabase = await createClient();
  const { count } = await supabase.from("exams").select("id", { count: "exact", head: true }).eq("term_id", str(f, "term_id"));
  if (count) back("This term has exams in it, so it can't be removed.");
  const { error } = await supabase.from("terms").delete().eq("id", str(f, "term_id"));
  back(error?.message, "term");
}

// "A+ 90, A 80, B 70" -> [{grade:"A+",min:90}, ...], highest first
export async function saveGradingScale(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const bands = str(f, "bands").split(/[,\n]/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(.+?)\s*[:=]?\s*(\d{1,3})%?$/);
    return m ? { grade: m[1].trim(), min: Number(m[2]) } : null;
  });
  if (!bands.length || bands.some((b) => !b || b.min > 100)) back("Write each grade with its lowest percent, like: A+ 90, A 80, B 70, F 0");
  const sorted = (bands as { grade: string; min: number }[]).sort((a, b) => b.min - a.min);
  if (sorted.at(-1)!.min !== 0) sorted.push({ grade: "F", min: 0 });
  const id = str(f, "scale_id");
  const { error } = id
    ? await supabase.from("grading_scales").update({ name: str(f, "name") || "Grades", bands: sorted }).eq("id", id)
    : await supabase.from("grading_scales").insert({ campus_id: me.campus_id, name: str(f, "name") || "Grades", bands: sorted });
  back(error?.message, "grades");
}

// End of year: every enrolled student in a section moves to the section picked for it.
// Students are collected first, so a child moved into 2-A is not moved again with 2-A's own students.
export async function promoteStudents(f: FormData) {
  await admin();
  const supabase = await createClient();
  if (f.get("sure") !== "on") back("Tick the box to confirm final results are done.");
  const plan = [...f.entries()].filter(([k, v]) => k.startsWith("to:") && String(v)).map(([k, v]) => ({ from: k.slice(3), to: String(v) }));
  const moves: { to: string; ids: string[] }[] = [];
  for (const p of plan) {
    if (p.to === p.from) continue;
    const { data } = await supabase.from("students").select("id").eq("section_id", p.from).eq("status", "enrolled");
    if (data?.length) moves.push({ to: p.to, ids: data.map((s) => s.id) });
  }
  let moved = 0;
  for (const m of moves) {
    for (let i = 0; i < m.ids.length; i += 150) {
      const ids = m.ids.slice(i, i + 150);
      const { error } = m.to === "out"
        ? await supabase.from("students").update({ status: "left" }).in("id", ids)
        : await supabase.from("students").update({ section_id: m.to }).in("id", ids);
      if (error) back(`${moved} students moved, then: ${error.message}`);
      moved += ids.length;
    }
  }
  back(undefined, `promoted-${moved}`);
}
