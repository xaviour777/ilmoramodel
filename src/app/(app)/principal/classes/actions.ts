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
  back(`/principal/classes?tab=classes&class=${c!.id}`, undefined, "program");
}

export async function setLevel(f: FormData) {
  await admin();
  const supabase = await createClient();
  const id = str(f, "class_id");
  const { error } = await supabase.from("classes").update({ level: str(f, "level") || null, program: str(f, "program") || null }).eq("id", id);
  back(`/principal/classes?tab=classes&class=${id}`, error?.message, "level");
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

// ---------- Classes v2: workspace, rooms, syllabus, bells ----------
const ws = (f: FormData) => str(f, "back") || "/principal/classes";

export async function saveSubjectTeacher(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const ppw = str(f, "periods_per_week");
  const { error } = await supabase.from("section_subjects").upsert({
    campus_id: me.campus_id, section_id: str(f, "section_id"), subject_id: str(f, "subject_id"),
    teacher_id: str(f, "teacher_id") || null, periods_per_week: ppw === "" ? null : Math.max(0, Math.min(60, Number(ppw) || 0)),
  }, { onConflict: "section_id,subject_id" });
  back(ws(f), error?.message, "subject");
}

export async function saveSyllabusPlan(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("syllabus_plans").upsert({
    campus_id: me.campus_id, class_id: str(f, "class_id"), subject_id: str(f, "subject_id"),
    chapters: Number(str(f, "chapters")) || 1, starts_on: str(f, "starts_on"), ends_on: str(f, "ends_on"),
  }, { onConflict: "class_id,subject_id" });
  back(ws(f), error?.message, "syllabus");
}

export async function addRoom(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("rooms").insert({
    campus_id: me.campus_id, name: str(f, "name"), kind: ["classroom", "lab", "other"].includes(str(f, "kind")) ? str(f, "kind") : "classroom",
    capacity: Number(str(f, "capacity")) || null,
  });
  back("/principal/classes?tab=rooms", error?.message, "room");
}

export async function removeRoom(f: FormData) {
  await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("rooms").delete().eq("id", str(f, "room_id"));
  back("/principal/classes?tab=rooms", error?.message, "room");
}

export async function assignRoom(f: FormData) {
  await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("sections").update({ room_id: str(f, "room_id") || null }).eq("id", str(f, "section_id"));
  back(ws(f) === "/principal/classes" ? "/principal/classes?tab=rooms" : ws(f), error?.message, "room");
}

export async function saveOverhead(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const { error } = await supabase.from("campus_settings").upsert({ campus_id: me.campus_id, room_overhead_paisa: Math.max(0, Math.round((Number(str(f, "rupees")) || 0) * 100)) }, { onConflict: "campus_id" });
  back("/principal/classes?tab=rooms", error?.message, "rules");
}

// A bell schedule from a few numbers: start, assembly, period length, periods a day, break.
// Existing class periods keep their place (and every timetable slot on them); only their clock times move.
export async function saveBellSchedule(f: FormData) {
  const me = await admin();
  const supabase = await createClient();
  const kind = str(f, "kind");
  const path = `/principal/classes?tab=bells&kind=${kind}`;
  const num = (k: string, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, Math.round(Number(str(f, k)) || d)));
  const start = str(f, "start_time") || "08:00";
  const len = num("period_minutes", 20, 90, 40), count = num("periods_per_day", 1, 12, 8), after = num("break_after", 0, 12, 4), brk = num("break_minutes", 0, 90, 20), asm = num("assembly_minutes", 0, 60, 0);
  const names: Record<string, string> = { winter: "Winter", summer: "Summer", ramadan: "Ramadan", friday: "Friday", exam: "Exam days" };
  let { data: prof } = await supabase.from("timing_profiles").select("id").eq("kind", kind).order("is_active", { ascending: false }).limit(1).maybeSingle();
  const fields = { start_time: start, period_minutes: len, periods_per_day: count, break_after: after, break_minutes: brk, assembly_minutes: asm,
    active_from: str(f, "active_from") || null, active_to: str(f, "active_to") || null };
  if (!prof) {
    const ins = await supabase.from("timing_profiles").insert({ campus_id: me.campus_id, name: names[kind] ?? "Timing", kind, ...fields }).select("id").single();
    if (ins.error) back(path, ins.error.message);
    prof = ins.data;
  } else {
    const up = await supabase.from("timing_profiles").update(fields).eq("id", prof.id);
    if (up.error) back(path, up.error.message);
  }
  // work out the day
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  let t = toMin(start);
  const plan: { name: string; kind: string; starts_at: string; ends_at: string; sort: number }[] = [];
  if (asm) { plan.push({ name: "Assembly", kind: "assembly", starts_at: hhmm(t), ends_at: hhmm(t + asm), sort: 0 }); t += asm; }
  for (let i = 1; i <= count; i++) {
    plan.push({ name: `Period ${i}`, kind: "class", starts_at: hhmm(t), ends_at: hhmm(t + len), sort: i * 10 }); t += len;
    if (i === after && brk) { plan.push({ name: "Break", kind: "break", starts_at: hhmm(t), ends_at: hhmm(t + brk), sort: i * 10 + 5 }); t += brk; }
  }
  const { data: existing } = await supabase.from("periods").select("id, kind, sort").eq("timing_profile_id", prof!.id).order("sort");
  const pool = { class: (existing ?? []).filter((p) => p.kind === "class"), break: (existing ?? []).filter((p) => p.kind === "break"), assembly: (existing ?? []).filter((p) => p.kind === "assembly") };
  const used = new Set<string>();
  for (const p of plan) {
    const reuse = pool[p.kind as keyof typeof pool].shift();
    if (reuse) { used.add(reuse.id); const r = await supabase.from("periods").update(p).eq("id", reuse.id); if (r.error) back(path, r.error.message); }
    else { const r = await supabase.from("periods").insert({ campus_id: me.campus_id, timing_profile_id: prof!.id, ...p }); if (r.error) back(path, r.error.message); }
  }
  // periods no longer in the day: removed only if no timetable slot uses them
  for (const p of existing ?? []) if (!used.has(p.id)) {
    const { count: n } = await supabase.from("timetable_slots").select("id", { count: "exact", head: true }).eq("period_id", p.id);
    if (!n) await supabase.from("periods").delete().eq("id", p.id);
  }
  if (f.get("use_now") === "on") {
    await supabase.from("timing_profiles").update({ is_active: false }).eq("campus_id", me.campus_id).eq("is_active", true);
    await supabase.from("timing_profiles").update({ is_active: true }).eq("id", prof!.id);
  }
  back(path, undefined, "bells");
}
