import type { createClient } from "@/lib/supabase/server";
import { todayPK } from "@/lib/format";
import { publishedWeek, weekdayOf } from "@/lib/timetable";
import { subjectTrends, type Kid, type MarkRow } from "@/lib/learning";
import type { PassportItem, Goal } from "@/components/passport-view";

type DB = Awaited<ReturnType<typeof createClient>>;
export type Hw = { id: string; title: string; due_on: string; subject: string; handedIn: boolean; checked: boolean; marks: number | null; remark: string | null };
export type Upcoming = { on_date: string; subject: string; title: string; kind: "test" | "exam" };

// What one child's day looks like: everything the student and parent home screens share.
// Row-level security returns only this family's rows.
export async function kidToday(supabase: DB, kid: Kid) {
  const today = todayPK();
  const since = new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10);
  const [att, homework, marks, upcoming, passport, goals, notes, ptm] = await Promise.all([
    supabase.from("attendance").select("date, status").eq("student_id", kid.id).gte("date", since).order("date", { ascending: false }),
    kid.section_id
      ? supabase.from("homework").select("id, title, due_on, subjects(name)").eq("section_id", kid.section_id).gte("due_on", today).order("due_on").limit(8)
      : Promise.resolve({ data: [] }),
    supabase.from("marks").select("subject_id, obtained, is_absent, subjects(name), exams(name, total_marks, starts_on, ends_on)").eq("student_id", kid.id).limit(500),
    supabase.rpc("upcoming_tests", { p_student: kid.id }),
    supabase.from("passport_items").select("id, kind, title, body, happened_on, status, teacher_note, show_public, link_url, created_by, approved_at, subjects(name)")
      .eq("student_id", kid.id).order("happened_on", { ascending: false }).limit(60),
    supabase.from("learning_goals").select("id, goal, target_on, status, done_at, subjects(name)").eq("student_id", kid.id).neq("status", "dropped").order("created_at", { ascending: false }).limit(20),
    supabase.from("behaviour_notes").select("id, kind, note, created_at").eq("student_id", kid.id).order("created_at", { ascending: false }).limit(3),
    supabase.from("ptm_slots").select("id, starts_at, place, teacher:profiles!ptm_slots_teacher_id_fkey(full_name)").eq("student_id", kid.id).gte("starts_at", new Date().toISOString()).order("starts_at").limit(3),
  ]);
  const hwRows = (homework.data ?? []) as unknown as { id: string; title: string; due_on: string; subjects: { name: string } | null }[];
  const { data: subs } = hwRows.length
    ? await supabase.from("homework_submissions").select("homework_id, submitted_at, checked_at, marks, remark").eq("student_id", kid.id).in("homework_id", hwRows.map((h) => h.id))
    : { data: [] };
  const subOf = new Map((subs ?? []).map((s) => [s.homework_id, s]));
  const hw: Hw[] = hwRows.map((h) => {
    const s = subOf.get(h.id);
    return { id: h.id, title: h.title, due_on: h.due_on, subject: h.subjects?.name ?? "", handedIn: !!s?.submitted_at, checked: !!s?.checked_at, marks: s?.marks ?? null, remark: s?.remark ?? null };
  });
  // recent checked homework remarks are teacher feedback too
  const { data: remarks } = await supabase.from("homework_submissions").select("remark, checked_at, homework(title, subjects(name))")
    .eq("student_id", kid.id).not("remark", "is", null).order("checked_at", { ascending: false }).limit(3);
  const week = kid.section_id ? await publishedWeek(supabase, kid.section_id) : null;
  const dayNo = weekdayOf(today);
  const periods = (week?.cells ?? []).filter((c) => c.weekday === dayNo).sort((a, b) => a.sort - b.sort);
  const A = att.data ?? [];
  const todayMark = A.find((a) => a.date === today)?.status ?? null;
  const present = A.filter((a) => a.status === "present" || a.status === "late").length;
  const { subjects, steps } = subjectTrends((marks.data ?? []) as unknown as MarkRow[]);
  return {
    today, dayNo, periods, timetablePublished: !!week && week.cells.length > 0,
    todayMark, attendanceRate: A.length ? present / A.length : null, attendanceDays: A.length, attendance: A,
    hw, upcoming: (upcoming.data ?? []) as Upcoming[], subjects, steps,
    items: (passport.data ?? []) as unknown as PassportItem[], goals: (goals.data ?? []) as unknown as Goal[],
    notes: (notes.data ?? []) as { id: string; kind: string; note: string; created_at: string }[],
    remarks: ((remarks ?? []) as { remark: string | null }[]).filter((r) => r.remark?.trim()) as unknown as { remark: string; checked_at: string | null; homework: { title: string; subjects: { name: string } | null } | null }[],
    meetings: (ptm.data ?? []) as unknown as { id: string; starts_at: string; place: string | null; teacher: { full_name: string } | null }[],
  };
}

// Real milestones worth a small celebration: approved in the last 14 days, or a goal reached.
export function milestones(d: Awaited<ReturnType<typeof kidToday>>, ur: boolean) {
  const since = Date.now() - 14 * 86400000;
  const a = d.items.filter((i) => i.status === "approved" && i.approved_at && Date.parse(i.approved_at) > since)
    .map((i) => ({ key: `item:${i.id}`, text: ur ? `منظور ہوا: ${i.title}` : `Approved: ${i.title}` }));
  const g = d.goals.filter((x) => x.status === "done" && x.done_at && Date.parse(x.done_at) > since)
    .map((x) => ({ key: `goal:${x.id}`, text: ur ? `ہدف پورا ہوا: ${x.goal}` : `Goal reached: ${x.goal}` }));
  return [...a, ...g];
}
