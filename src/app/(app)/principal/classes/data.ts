import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";

// Everything the Classes tabs need, read once per request.

export const LEVELS = [
  { id: "pre", label: "Pre-school" },
  { id: "primary", label: "Primary" },
  { id: "middle", label: "Middle" },
  { id: "matric", label: "Matric" },
  { id: "intermediate", label: "Intermediate (11–12)" },
  { id: "graduate", label: "BS / ADP" },
] as const;
export type Level = (typeof LEVELS)[number]["id"];
export const levelLabel = (l: string) => LEVELS.find((x) => x.id === l)?.label ?? l;
export const levelOf = (c: { level: string | null; sort: number; name: string }): Level =>
  (c.level as Level) ?? (/play|nursery|prep|kg/i.test(c.name) || c.sort <= 0 ? "pre" : c.sort <= 5 ? "primary" : c.sort <= 8 ? "middle" : c.sort <= 10 ? "matric" : c.sort <= 12 ? "intermediate" : "graduate");

// Programs a Pakistani school commonly adds after matric.
export const PROGRAMS: { level: Level; sort: number; name: string; program: string; board: string }[] = [
  { level: "intermediate", sort: 11, name: "Class 11", program: "FSc Pre-Medical", board: "BISE" },
  { level: "intermediate", sort: 11, name: "Class 11", program: "FSc Pre-Engineering", board: "BISE" },
  { level: "intermediate", sort: 11, name: "Class 11", program: "ICS", board: "BISE" },
  { level: "intermediate", sort: 11, name: "Class 11", program: "FA", board: "BISE" },
  { level: "intermediate", sort: 11, name: "Class 11", program: "I.Com", board: "BISE" },
  { level: "graduate", sort: 13, name: "BS", program: "BS Computer Science", board: "University affiliation" },
  { level: "graduate", sort: 13, name: "ADP", program: "ADP", board: "University affiliation" },
];
export const classTitle = (c: { name: string; program: string | null }) => (c.program ? `${c.name} · ${c.program}` : c.name);

type Cls = { id: string; name: string; board: string | null; sort: number; level: string | null; program: string | null };
type Sec = { id: string; name: string; class_id: string; capacity: number | null; class_teacher_id: string | null };
export type Rules = { pass_mark: number; promote_min_attendance: number; max_periods_week: number; weight_attendance: number; weight_results: number; weight_fees: number; weight_homework: number };
const DEFAULT_RULES: Rules = { pass_mark: 33, promote_min_attendance: 75, max_periods_week: 36, weight_attendance: 25, weight_results: 35, weight_fees: 20, weight_homework: 20 };

const page = <T,>(q: (f: number, t: number) => unknown) => fetchAll<T>(q as (f: number, t: number) => PromiseLike<{ data: T[] | null; error: unknown }>);

export const loadSchool = cache(async () => {
  const supabase = await createClient();
  const [{ data: classes }, { data: sections }, { data: staff }, { data: year }, { data: rules }, { data: subjects }] = await Promise.all([
    supabase.from("classes").select("id, name, board, sort, level, program").order("sort").order("name"),
    supabase.from("sections").select("id, name, class_id, capacity, class_teacher_id"),
    supabase.from("profiles").select("id, full_name, role").in("role", ["teacher", "principal"]).eq("is_active", true).order("full_name"),
    supabase.from("academic_sessions").select("id, name, starts_on, ends_on").eq("is_current", true).maybeSingle(),
    supabase.from("campus_settings").select("pass_mark, promote_min_attendance, max_periods_week, weight_attendance, weight_results, weight_fees, weight_homework").maybeSingle(),
    supabase.from("subjects").select("id, name").order("name"),
  ]);
  const since = year?.starts_on ?? new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const [students, attDays, secSubjects, slots, results, invoices, homework] = await Promise.all([
    page<{ id: string; section_id: string | null }>((f, t) => supabase.from("students").select("id, section_id").eq("status", "enrolled").order("id").range(f, t)),
    page<{ section_id: string; present: number; marked: number }>((f, t) => supabase.from("attendance_by_section_day").select("section_id, present, marked").gte("date", since).order("date").order("section_id").range(f, t)),
    supabase.from("section_subjects").select("section_id, subject_id, teacher_id"),
    page<{ section_id: string; teacher_id: string | null }>((f, t) => supabase.from("timetable_slots").select("section_id, teacher_id").order("id").range(f, t)),
    supabase.from("exams").select("id, total_marks, kind, starts_on, terms!inner(academic_sessions!inner(is_current))").eq("status", "results").eq("terms.academic_sessions.is_current", true),
    page<{ invoice_lines: { amount_paisa: number; students: { section_id: string | null } | null }[]; payments: { amount_paisa: number }[] }>((f, t) =>
      supabase.from("invoices").select("invoice_lines(amount_paisa, students(section_id)), payments(amount_paisa)").gte("billing_month", since).order("id").range(f, t)),
    page<{ section_id: string; students: number; submitted: number }>((f, t) => supabase.from("homework_progress").select("section_id, students, submitted").gte("due_on", since).order("homework_id").range(f, t)),
  ]);
  const examTotal = new Map((results.data ?? []).map((e) => [e.id, e.total_marks || 100]));
  const marks = examTotal.size
    ? await page<{ exam_id: string; student_id: string; subject_id: string; obtained: number; students: { section_id: string | null } | null }>((f, t) =>
      supabase.from("marks").select("exam_id, student_id, subject_id, obtained, students(section_id)").in("exam_id", [...examTotal.keys()]).eq("is_absent", false).not("obtained", "is", null).order("id").range(f, t))
    : [];

  const r = { ...DEFAULT_RULES, ...(rules ?? {}) } as Rules;
  const size = new Map<string, number>();
  for (const s of students) if (s.section_id) size.set(s.section_id, (size.get(s.section_id) ?? 0) + 1);
  const att = new Map<string, { p: number; m: number }>();
  for (const a of attDays) { const c = att.get(a.section_id) ?? { p: 0, m: 0 }; c.p += a.present; c.m += a.marked; att.set(a.section_id, c); }
  // per student per subject average across published exams, then per section
  const stuSubj = new Map<string, { sec: string | null; s: number; n: number }>();
  for (const m of marks) {
    const k = `${m.student_id}|${m.subject_id}`;
    const c = stuSubj.get(k) ?? { sec: m.students?.section_id ?? null, s: 0, n: 0 };
    c.s += Number(m.obtained) / (examTotal.get(m.exam_id) ?? 100); c.n++; stuSubj.set(k, c);
  }
  const stuAvg = new Map<string, { sec: string | null; rs: number[] }>();
  for (const [k, v] of stuSubj) { const id = k.split("|")[0]; const c = stuAvg.get(id) ?? { sec: v.sec, rs: [] }; c.rs.push(v.s / v.n); stuAvg.set(id, c); }
  const res = new Map<string, { avg: number; pass: number; n: number }>();
  for (const v of stuAvg.values()) {
    if (!v.sec) continue;
    const a = v.rs.reduce((x, y) => x + y, 0) / v.rs.length;
    const passed = v.rs.every((x) => x * 100 >= r.pass_mark);
    const c = res.get(v.sec) ?? { avg: 0, pass: 0, n: 0 }; c.avg += a; c.pass += passed ? 1 : 0; c.n++; res.set(v.sec, c);
  }
  const fee = new Map<string, { due: number; paid: number }>();
  for (const inv of invoices) {
    const due = inv.invoice_lines.reduce((t, l) => t + Number(l.amount_paisa), 0);
    const paid = Math.min(due, inv.payments.reduce((t, p) => t + Number(p.amount_paisa), 0));
    for (const l of inv.invoice_lines) { const sid = l.students?.section_id; if (!sid || due <= 0) continue; const c = fee.get(sid) ?? { due: 0, paid: 0 }; c.due += Number(l.amount_paisa); c.paid += paid * Number(l.amount_paisa) / due; fee.set(sid, c); }
  }
  const hw = new Map<string, { s: number; n: number }>();
  for (const h of homework) { const c = hw.get(h.section_id) ?? { s: 0, n: 0 }; c.s += Number(h.submitted); c.n += Number(h.students); hw.set(h.section_id, c); }
  const teachersOf = new Map<string, Set<string>>();
  for (const x of secSubjects.data ?? []) if (x.teacher_id) teachersOf.set(x.section_id, (teachersOf.get(x.section_id) ?? new Set()).add(x.teacher_id));
  for (const s of (sections ?? []) as Sec[]) if (s.class_teacher_id) teachersOf.set(s.id, (teachersOf.get(s.id) ?? new Set()).add(s.class_teacher_id));
  const periodsOf = new Map<string, number>(), slotsOf = new Map<string, number>();
  for (const t of slots) { slotsOf.set(t.section_id, (slotsOf.get(t.section_id) ?? 0) + 1); if (t.teacher_id) periodsOf.set(t.teacher_id, (periodsOf.get(t.teacher_id) ?? 0) + 1); }

  const cls = ((classes ?? []) as Cls[]).map((c) => ({ ...c, lvl: levelOf(c) }));
  const secs = ((sections ?? []) as Sec[]).map((s) => {
    const c = cls.find((x) => x.id === s.class_id)!;
    const a = att.get(s.id), rr = res.get(s.id), f = fee.get(s.id), h = hw.get(s.id);
    return {
      ...s, cls: c, label: `${c.name.replace(/^Class /, "")}${c.program ? ` ${c.program}` : ""}-${s.name}`, students: size.get(s.id) ?? 0,
      att: a?.m ? a.p / a.m : null, result: rr?.n ? rr.avg / rr.n : null, pass: rr?.n ? rr.pass / rr.n : null,
      fees: f?.due ? f.paid / f.due : null, homework: h?.n ? h.s / h.n : null,
      teachers: teachersOf.get(s.id)?.size ?? 0, slots: slotsOf.get(s.id) ?? 0,
    };
  }).filter((s) => s.cls).sort((a, b) => a.cls.sort - b.cls.sort || (a.cls.program ?? "").localeCompare(b.cls.program ?? "") || a.name.localeCompare(b.name));
  const teacherName = new Map((staff ?? []).map((t) => [t.id, t.full_name]));
  const score = (s: (typeof secs)[number]) => {
    const parts: [number | null, number][] = [[s.att, r.weight_attendance], [s.result, r.weight_results], [s.fees, r.weight_fees], [s.homework, r.weight_homework]];
    const have = parts.filter(([v]) => v != null) as [number, number][];
    const w = have.reduce((t, [, x]) => t + x, 0);
    return w ? Math.round((have.reduce((t, [v, x]) => t + v * x, 0) / w) * 100) : null;
  };
  return { classes: cls, sections: secs, staff: staff ?? [], teacherName, year, rules: r, subjects: subjects ?? [], secSubjects: secSubjects.data ?? [], periodsOf, stuAvg, score, examCount: examTotal.size };
});
export type School = Awaited<ReturnType<typeof loadSchool>>;
