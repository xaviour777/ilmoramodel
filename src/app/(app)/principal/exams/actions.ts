"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { fetchAll } from "@/lib/fetch-all";
import { familiesByIds, queueForFamilies } from "@/lib/outbox";
import { deliverQueued } from "@/lib/deliver";
import { pushTo } from "@/lib/push";
import { dayLabel, ordinal, positions, schoolDays } from "@/lib/exam-flow";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, error?: string, ok?: string): never => {
  const sep = path.includes("?") ? "&" : "?";
  if (error) redirect(`${path}${sep}error=${encodeURIComponent(error)}`);
  revalidatePath("/principal/exams");
  redirect(`${path}${ok ? `${sep}saved=${ok}` : ""}`);
};

export async function setInvigilator(f: FormData) {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.from("exam_papers").update({ invigilator_id: str(f, "invigilator_id") || null }).eq("id", str(f, "paper_id"));
  back(str(f, "back") || "/principal/exams?tab=day", error?.message, "1");
}

export async function saveBoardResult(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const n = (k: string) => Math.max(0, Math.round(Number(str(f, k)) || 0));
  const { error } = await supabase.from("board_results").upsert({
    campus_id: me.campus_id, year: n("year"), class_level: n("class_level") || 10, appeared: n("appeared"), passed: n("passed"), a_plus: n("a_plus"),
    average: str(f, "average") ? Number(str(f, "average")) : null,
  }, { onConflict: "campus_id,year,class_level" });
  back("/principal/exams?tab=gaps", error?.message, "1");
}

export async function saveBoardTarget(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const v = Math.round(Number(str(f, "board_target")) || 0);
  const { error } = await supabase.from("campus_settings").upsert({ campus_id: me.campus_id, board_target: v >= 1 && v <= 100 ? v : null }, { onConflict: "campus_id" });
  back(str(f, "back") || "/principal/exams?tab=board", error?.message, "1");
}

// ---------- Exam flow ----------
type Supabase = Awaited<ReturnType<typeof createClient>>;
type Kid = { id: string; full_name: string; family_id: string; section_id: string; roll_no: string | null };
const NONE = ["00000000-0000-0000-0000-000000000000"];
const flowBack = (f: FormData) => `/principal/exams?term=${str(f, "term_id")}&exam=${str(f, "exam_id")}`;

// The exam's sections with their class, and the enrolled students in them.
async function examPeople(supabase: Supabase, examId: string) {
  const { data: es } = await supabase.from("exam_sections").select("section_id, sections(name, class_id, classes(name, sort))").eq("exam_id", examId);
  const secs = ((es ?? []) as unknown as { section_id: string; sections: { name: string; class_id: string; classes: { name: string; sort: number } } }[])
    .map((s) => ({ id: s.section_id, name: s.sections.name, classId: s.sections.class_id, className: s.sections.classes.name, sort: s.sections.classes.sort }));
  const ids = secs.map((s) => s.id);
  const kids = await fetchAll<Kid>((a, b) => supabase.from("students").select("id, full_name, family_id, section_id, roll_no").eq("status", "enrolled")
    .in("section_id", ids.length ? ids : NONE).order("id").range(a, b) as unknown as PromiseLike<{ data: Kid[] | null; error: unknown }>);
  return { secs, kids };
}

// One tap date sheet: every class's subjects, one paper a day, skipping Sundays and holidays.
// The same subject falls on the same day for every class where it can, so invigilation stays simple.
export async function autoDateSheet(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const examId = str(f, "exam_id");
  const start = str(f, "start");
  if (!start) back(flowBack(f), "Choose the first paper's date.");
  const { secs } = await examPeople(supabase, examId);
  if (!secs.length) back(flowBack(f), "This exam has no classes. Create it again and tick the classes.");
  const [{ data: ss }, { data: allSubjects }, { data: holidays }] = await Promise.all([
    supabase.from("section_subjects").select("section_id, subject_id, subjects(name)").in("section_id", secs.map((s) => s.id)),
    supabase.from("subjects").select("id, name").order("name"),
    supabase.from("holidays").select("starts_on, ends_on").in("kind", ["holiday", "vacation"]).gte("ends_on", start),
  ]);
  const classOf = new Map(secs.map((s) => [s.id, s.classId]));
  const byClass = new Map<string, Map<string, string>>();
  for (const r of (ss ?? []) as unknown as { section_id: string; subject_id: string; subjects: { name: string } }[]) {
    const c = classOf.get(r.section_id)!;
    byClass.set(c, (byClass.get(c) ?? new Map()).set(r.subject_id, r.subjects.name));
  }
  const classes = [...new Set(secs.map((s) => s.classId))];
  // classes with no subjects set get every subject of the school
  for (const c of classes) if (!byClass.get(c)?.size) byClass.set(c, new Map((allSubjects ?? []).map((s) => [s.id, s.name])));
  // order: subjects most classes share first, so they line up on the same day
  const freq = new Map<string, number>();
  for (const m of byClass.values()) for (const id of m.keys()) freq.set(id, (freq.get(id) ?? 0) + 1);
  const order = (m: Map<string, string>) => [...m.entries()].sort((a, b) => (freq.get(b[0])! - freq.get(a[0])!) || a[1].localeCompare(b[1])).map(([id]) => id);
  const most = Math.max(...[...byClass.values()].map((m) => m.size));
  const days = schoolDays(start, most, holidays ?? [], { saturday: str(f, "saturday") === "1", gap: Math.max(0, Math.min(2, Number(str(f, "gap")) || 0)) });
  const rows = classes.flatMap((c) => order(byClass.get(c)!).map((subject, i) => ({
    campus_id: me.campus_id, exam_id: examId, class_id: c, subject_id: subject, paper_date: days[i],
    starts_at: str(f, "starts_at") || null, ends_at: str(f, "ends_at") || null,
  })));
  await supabase.from("exam_papers").delete().eq("exam_id", examId);
  const { error } = await supabase.from("exam_papers").insert(rows);
  if (!error) await supabase.from("exams").update({ starts_on: days[0], ends_on: days.at(-1) }).eq("id", examId);
  back(flowBack(f), error?.message, "datesheet");
}

// Each family gets its own children's papers only.
export async function sendDateSheet(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const examId = str(f, "exam_id");
  const [{ data: exam }, { data: papers }, { secs, kids }] = await Promise.all([
    supabase.from("exams").select("name").eq("id", examId).single(),
    supabase.from("exam_papers").select("class_id, paper_date, starts_at, subjects(name)").eq("exam_id", examId).order("paper_date"),
    examPeople(supabase, examId),
  ]);
  if (!papers?.length) back(flowBack(f), "Make the date sheet first.");
  const sec = new Map(secs.map((s) => [s.id, s]));
  const byClass = new Map<string, string[]>();
  for (const p of (papers ?? []) as unknown as { class_id: string; paper_date: string; starts_at: string | null; subjects: { name: string } }[])
    byClass.set(p.class_id, [...(byClass.get(p.class_id) ?? []), `${dayLabel(p.paper_date)}: ${p.subjects.name}${p.starts_at ? ` (${p.starts_at.slice(0, 5)})` : ""}`]);
  const kidsOf = new Map<string, Kid[]>();
  for (const k of kids) kidsOf.set(k.family_id, [...(kidsOf.get(k.family_id) ?? []), k]);
  const families = await familiesByIds(supabase, [...kidsOf.keys()]);
  const q = await queueForFamilies(supabase, {
    campusId: me.campus_id, families, kind: "notice",
    text: (fam) => [`${me.campus_name}: ${exam!.name} date sheet`, ...kidsOf.get(fam.id)!.map((k) => {
      const s = sec.get(k.section_id)!;
      return `\n${k.full_name} (${s.className}-${s.name})\n${(byClass.get(s.classId) ?? ["No papers"]).join("\n")}`;
    }), "\nPlease make sure your child comes on time. Fees must be clear for the admit card."].join("\n"),
  });
  if (q.error) back(flowBack(f), q.error);
  const d = await deliverQueued(supabase);
  back(flowBack(f), undefined, `sent-${q.queued}-${q.skipped}-${d.sent}`);
}

// Teachers whose marks are not all in get a reminder in their app.
export async function remindLateTeachers(f: FormData) {
  await requireRole("principal", "owner");
  const ids = f.getAll("teacher_id").map(String).filter(Boolean);
  const n = ids.length ? await pushTo({ profiles: ids }, { title: "Marks are due", body: `Please enter your marks for ${str(f, "exam_name")}. The principal is waiting to publish results.`, url: "/teacher/marks" }) : 0;
  back(flowBack(f), undefined, `reminded-${ids.length}-${n}`);
}

// The office or principal types marks for any section, even with no subject teacher set.
export async function saveOfficeMarks(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const examId = str(f, "exam_id"), subjectId = str(f, "subject_id"), sectionId = str(f, "section_id");
  const to = `/principal/exams/marks?exam=${examId}&section=${sectionId}&subject=${subjectId}`;
  const rows = f.getAll("student_id").map(String).flatMap((id) => {
    const raw = str(f, "m_" + id);
    if (!raw) return [];
    const absent = raw.toUpperCase() === "A";
    return [{ campus_id: me.campus_id, exam_id: examId, subject_id: subjectId, student_id: id, obtained: absent ? null : Number(raw), is_absent: absent, entered_by: me.id }];
  });
  if (rows.some((r) => r.obtained !== null && Number.isNaN(r.obtained))) back(to, "Marks must be numbers, or A for absent.");
  const { error } = rows.length ? await supabase.from("marks").upsert(rows, { onConflict: "exam_id,subject_id,student_id" }) : { error: null };
  const next = str(f, "next");
  back(error || !next ? to : next, error?.message, "1");
}

// After results: one message per family with each child's marks, percentage and class position.
export async function sendResults(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const examId = str(f, "exam_id");
  const [{ data: exam }, { secs, kids }] = await Promise.all([
    supabase.from("exams").select("name, total_marks, status").eq("id", examId).single(),
    examPeople(supabase, examId),
  ]);
  if (exam?.status !== "results") back(flowBack(f), "Publish the results first.");
  type M = { student_id: string; obtained: number | null; is_absent: boolean; subjects: { name: string } };
  const marks = await fetchAll<M>((a, b) => supabase.from("marks").select("student_id, obtained, is_absent, subjects(name)").eq("exam_id", examId).order("id").range(a, b) as unknown as PromiseLike<{ data: M[] | null; error: unknown }>);
  const per = new Map<string, M[]>();
  for (const m of marks) per.set(m.student_id, [...(per.get(m.student_id) ?? []), m]);
  const sum = (ms: M[]) => ms.reduce((t, m) => t + Number(m.obtained ?? 0), 0);
  const pos = new Map<string, number>();
  for (const s of secs) for (const r of positions(kids.filter((k) => k.section_id === s.id && per.has(k.id)).map((k) => ({ id: k.id, total: sum(per.get(k.id)!) })))) pos.set(r.id, r.pos);
  const sec = new Map(secs.map((s) => [s.id, s]));
  const kidsOf = new Map<string, Kid[]>();
  for (const k of kids) if (per.has(k.id)) kidsOf.set(k.family_id, [...(kidsOf.get(k.family_id) ?? []), k]);
  if (!kidsOf.size) back(flowBack(f), "No marks are entered for this exam.");
  const families = await familiesByIds(supabase, [...kidsOf.keys()]);
  const out = exam!.total_marks;
  const q = await queueForFamilies(supabase, {
    campusId: me.campus_id, families, kind: "notice",
    text: (fam) => [`${me.campus_name}: ${exam!.name} result`, ...kidsOf.get(fam.id)!.map((k) => {
      const ms = per.get(k.id)!; const s = sec.get(k.section_id)!; const total = sum(ms);
      const lines = ms.map((m) => `${m.subjects.name}: ${m.is_absent ? "Absent" : `${Number(m.obtained)}/${out}`}`);
      return `\n${k.full_name} (${s.className}-${s.name})\n${lines.join("\n")}\nTotal ${total}/${out * ms.length} (${Math.round((total / (out * ms.length)) * 100)}%) · ${ordinal(pos.get(k.id) ?? 0)} in class`;
    }), "\nFull report card: open the Prinqo parent app."].join("\n"),
  });
  if (q.error) back(flowBack(f), q.error);
  const d = await deliverQueued(supabase);
  back(flowBack(f), undefined, `sent-${q.queued}-${q.skipped}-${d.sent}`);
}
