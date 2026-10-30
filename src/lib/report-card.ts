import { createClient } from "@/lib/supabase/server";
import { allRows } from "@/lib/outbox";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Band = { grade: string; min: number };

export type ReportCard = {
  student: { id: string; full_name: string; roll_no: string | null; admission_no: string | null };
  exams: { id: string; name: string; total: number }[];
  subjects: { name: string; marks: (number | "A" | null)[]; got: number; out: number }[];
  got: number; out: number; percent: number; grade: string; position: number; outOf: number;
  attendance: { present: number; days: number };
};

export const gradeFor = (bands: Band[], percent: number) =>
  [...bands].sort((a, b) => b.min - a.min).find((b) => percent * 100 >= b.min)?.grade ?? "";

export const DEFAULT_BANDS: Band[] = [
  { grade: "A+", min: 90 }, { grade: "A", min: 80 }, { grade: "B", min: 70 }, { grade: "C", min: 60 },
  { grade: "D", min: 50 }, { grade: "E", min: 40 }, { grade: "F", min: 0 },
];

// Report cards for one section, this session's published exams only. Position compares
// everyone in the section by overall percentage (equal percentages share a position).
export async function sectionReportCards(supabase: Supabase, sectionId: string) {
  const [{ data: section }, { data: students }, { data: exams }] = await Promise.all([
    supabase.from("sections").select("name, classes(name), class_teacher:profiles!sections_class_teacher_id_fkey(full_name)").eq("id", sectionId).maybeSingle(),
    supabase.from("students").select("id, full_name, roll_no, admission_no").eq("section_id", sectionId).eq("status", "enrolled").order("roll_no").order("full_name"),
    supabase.from("exams").select("id, name, total_marks, starts_on, grading_scales(bands), terms!inner(academic_sessions!inner(name, is_current, starts_on, ends_on)), exam_sections!inner(section_id)")
      .eq("status", "results").eq("terms.academic_sessions.is_current", true).eq("exam_sections.section_id", sectionId).order("starts_on"),
  ]);
  type E = { id: string; name: string; total_marks: number; grading_scales: { bands: Band[] } | null; terms: { academic_sessions: { name: string; starts_on: string; ends_on: string } } };
  const ex = (exams ?? []) as unknown as E[];
  const ids = (students ?? []).map((s) => s.id);
  const session = ex[0]?.terms.academic_sessions ?? null;
  const [{ data: marks }, { data: att }] = await Promise.all([
    ids.length && ex.length
      ? allRows<unknown>((a, b) => supabase.from("marks").select("student_id, exam_id, obtained, is_absent, subjects(name)")
          .in("student_id", ids).in("exam_id", ex.map((e) => e.id)).order("id").range(a, b)).then((data) => ({ data }))
      : Promise.resolve({ data: [] }),
    ids.length && session
      // a section has thousands of attendance rows a year, more than one request returns
      ? allRows<{ student_id: string; status: string }>((a, b) => supabase.from("attendance").select("student_id, status")
          .eq("section_id", sectionId).gte("date", session.starts_on).lte("date", session.ends_on).order("id").range(a, b)).then((data) => ({ data }))
      : Promise.resolve({ data: [] }),
  ]);
  const bands = ex.find((e) => e.grading_scales)?.grading_scales?.bands ?? DEFAULT_BANDS;
  type Mk = { student_id: string; exam_id: string; obtained: number | null; is_absent: boolean; subjects: { name: string } };
  const cards: ReportCard[] = (students ?? []).map((st) => {
    const mine = ((marks ?? []) as unknown as Mk[]).filter((m) => m.student_id === st.id);
    const subjectNames = [...new Set(mine.map((m) => m.subjects.name))].sort();
    const subjects = subjectNames.map((name) => {
      let got = 0, out = 0;
      const row = ex.map((e) => {
        const m = mine.find((x) => x.exam_id === e.id && x.subjects.name === name);
        if (!m) return null;
        out += e.total_marks;
        if (m.is_absent) return "A" as const;
        got += Number(m.obtained ?? 0);
        return Number(m.obtained ?? 0);
      });
      return { name, marks: row, got, out };
    });
    const got = subjects.reduce((t, s) => t + s.got, 0);
    const out = subjects.reduce((t, s) => t + s.out, 0);
    const a = (att ?? []).filter((x) => x.student_id === st.id);
    return {
      student: st, exams: ex.map((e) => ({ id: e.id, name: e.name, total: e.total_marks })), subjects, got, out,
      percent: out ? got / out : 0, grade: "", position: 0, outOf: 0,
      attendance: { present: a.filter((x) => x.status === "present" || x.status === "late").length, days: a.length },
    };
  });
  const ranked = cards.filter((c) => c.out > 0).sort((a, b) => b.percent - a.percent);
  for (const c of cards) {
    c.grade = c.out ? gradeFor(bands, c.percent) : "";
    c.position = c.out ? ranked.findIndex((r) => r.percent === c.percent) + 1 : 0;
    c.outOf = ranked.length;
  }
  type S = { name: string; classes: { name: string }; class_teacher: { full_name: string } | null };
  const sec = section as unknown as S | null;
  return {
    cards, session: session?.name ?? "",
    sectionLabel: sec ? `${sec.classes.name}-${sec.name}` : "", classTeacher: sec?.class_teacher?.full_name ?? "",
  };
}
