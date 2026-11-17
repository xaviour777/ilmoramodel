"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { familiesForAudience, queueForFamilies } from "@/lib/outbox";
import { deliverQueued } from "@/lib/deliver";
import { noticeText } from "@/lib/messages";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, error?: string, ok?: string): never => {
  const sep = path.includes("?") ? "&" : "?";
  if (error) redirect(`${path}${sep}error=${encodeURIComponent(error)}`);
  revalidatePath("/principal/classes");
  redirect(`${path}${ok ? `${sep}saved=${ok}` : ""}`);
};
const admin = () => requireRole("principal", "owner");

// A class or program, optionally with its first sections (none = "Not started").
export async function addProgram(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const name = str(f, "name");
  if (!name) back("/principal/classes", "Write the class or program name.");
  const { data: c, error } = await supabase.from("classes").insert({
    campus_id: me.campus_id, name, program: str(f, "program") || null, level: str(f, "level") || null,
    board: str(f, "board") || null, sort: Number(str(f, "sort")) || 0,
  }).select("id").single();
  if (error) back("/principal/classes", error.message);
  const secs = str(f, "sections").split(",").map((s) => s.trim()).filter(Boolean);
  if (secs.length) {
    const { error: e2 } = await supabase.from("sections").insert(secs.map((n) => ({ campus_id: me.campus_id, class_id: c!.id, name: n, capacity: Number(str(f, "capacity")) || 40 })));
    if (e2) back("/principal/classes", e2.message);
  }
  back(`/principal/classes?class=${c!.id}`, undefined, "program");
}

export async function setLevel(f: FormData) {
  await admin();
  const supabase = await createClient();
  const id = str(f, "class_id");
  const { error } = await supabase.from("classes").update({ level: str(f, "level") || null, program: str(f, "program") || null }).eq("id", id);
  back(`/principal/classes?class=${id}`, error?.message, "level");
}

// Promote one section: each student's decision, target section, roll numbers, parents told.
export async function promoteSection(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const from = str(f, "section_id");
  const path = `/principal/classes?tab=promote&section=${from}`;
  const ids = f.getAll("student_id").map(String);
  const target = str(f, "target");
  const rollMode = str(f, "rolls");
  const decided = ids.map((id) => ({ id, kind: str(f, `dec:${id}`) || "promote", program: str(f, `prog:${id}`), score: Number(str(f, `score:${id}`)) || 0, name: str(f, `name:${id}`) }));
  // students going to Class 11 go to the first section of their chosen program
  const { data: progSecs } = await supabase.from("sections").select("id, name, classes!inner(program, level)").eq("classes.level", "intermediate");
  const progTarget = new Map<string, string>();
  for (const s of (progSecs ?? []) as unknown as { id: string; name: string; classes: { program: string | null } }[]) if (s.classes.program && !progTarget.has(s.classes.program)) progTarget.set(s.classes.program, s.id);
  const moving = decided.filter((d) => d.kind === "promote" || d.kind === "conditional");
  const toOf = (d: (typeof decided)[number]) => (d.program ? progTarget.get(d.program) : target) || "";
  const missing = moving.filter((d) => !toOf(d));
  if (missing.length) back(path, missing.some((d) => d.program) ? `Add a section to ${[...new Set(missing.map((d) => d.program))].join(", ")} first (Classes tab).` : "Choose the class and section to move them to.");
  // roll numbers within each target section
  const roll = new Map<string, string>();
  if (rollMode === "merit" || rollMode === "name") {
    const byTo = new Map<string, typeof moving>();
    for (const d of moving) byTo.set(toOf(d), [...(byTo.get(toOf(d)) ?? []), d]);
    for (const list of byTo.values()) {
      list.sort((a, b) => rollMode === "merit" ? b.score - a.score : a.name.localeCompare(b.name));
      list.forEach((d, i) => roll.set(d.id, String(i + 1)));
    }
  }
  const moves = decided.map((d) => ({
    student_id: d.id, kind: d.kind, program: d.program || undefined,
    ...(d.kind === "promote" || d.kind === "conditional" ? { to_section_id: toOf(d), ...(roll.has(d.id) ? { to_roll: roll.get(d.id) } : {}) } : {}),
  }));
  const { data: batch, error } = await supabase.rpc("apply_student_moves", { p_moves: moves, p_reason: "Annual promotion", p_note: str(f, "note") || null, p_effective: str(f, "effective_on") || null });
  if (error) back(path, error.message);
  // tell parents of each new section, in the app and, if asked, on WhatsApp / SMS
  if (f.get("notify") === "on") {
    const targets = [...new Set(moving.map(toOf))];
    for (const sec of targets) {
      const { data: n } = await supabase.from("notices").insert({ campus_id: me.campus_id, title: "Promoted to the next class", body: "Congratulations! Your child has been promoted. The new class, section and timetable are in the app.", audience: "section", section_id: sec, created_by: me.id }).select("id").single();
      if (n && f.get("phones") === "on") {
        const families = await familiesForAudience(supabase, "section", null, sec);
        await queueForFamilies(supabase, { campusId: me.campus_id, families, kind: "notice", noticeId: n.id, text: () => noticeText({ title: "Promoted to the next class", body: "Congratulations! Your child has been promoted. See the app for the new class and timetable.", campus: me.campus_name }) });
      }
    }
    if (f.get("phones") === "on") await deliverQueued(supabase);
  }
  back(`/principal/classes?tab=promote&section=${from}&batch=${batch}`, undefined, `promoted-${moving.length}`);
}

export async function moveStudents(f: FormData) {
  await admin();
  const supabase = await createClient();
  const ids = f.getAll("student_id").map(String).filter(Boolean);
  const to = str(f, "to_section_id");
  const path = "/principal/classes?tab=move";
  if (!ids.length) back(path, "Choose at least one student.");
  if (!to) back(path, "Choose the section to move to.");
  const { error } = await supabase.rpc("apply_student_moves", {
    p_moves: ids.map((id) => ({ student_id: id, kind: "move", to_section_id: to })),
    p_reason: str(f, "reason") || null, p_note: str(f, "note") || null, p_effective: str(f, "effective_on") || null,
  });
  back(path, error?.message, `moved-${ids.length}`);
}

export async function undoMoves(f: FormData) {
  await admin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_student_moves", { p_batch: str(f, "batch_id") });
  back(str(f, "back") || "/principal/classes?tab=move", error?.message, `undone-${data ?? 0}`);
}

export async function saveRules(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const n = (k: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(str(f, k)) || 0)));
  const row: Record<string, number | string> = { campus_id: me.campus_id };
  for (const [k, lo, hi] of [["pass_mark", 1, 100], ["promote_min_attendance", 0, 100], ["max_periods_week", 1, 60], ["weight_attendance", 0, 100], ["weight_results", 0, 100], ["weight_fees", 0, 100], ["weight_homework", 0, 100]] as const)
    if (f.has(k)) row[k] = n(k, lo, hi);
  const { error } = await supabase.from("campus_settings").upsert(row, { onConflict: "campus_id" });
  back(str(f, "back") || "/principal/classes", error?.message, "rules");
}
