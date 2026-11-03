import type { SupabaseClient } from "@supabase/supabase-js";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// One period of one day, as the grid shows it.
export type Cell = {
  weekday: number;          // 1 = Monday
  period: string;
  starts_at: string;
  ends_at: string;
  sort: number;
  subject: string;
  teacher: string | null;
  section?: string;         // on a teacher's own week
};

type SlotRow = {
  weekday: number; teacher_id: string | null; section_id: string;
  periods: { name: string; starts_at: string; ends_at: string; sort: number } | null;
  subjects: { name: string } | null; profiles: { full_name: string } | null;
  sections: { name: string; classes: { name: string } } | null;
};

const SLOT_COLS = "weekday, teacher_id, section_id, periods!inner(name, starts_at, ends_at, sort, timing_profiles!inner(is_active)), subjects(name), profiles(full_name), sections(name, classes(name))";

function toCell(s: SlotRow, withSection: boolean): Cell {
  return {
    weekday: s.weekday, period: s.periods!.name, starts_at: s.periods!.starts_at, ends_at: s.periods!.ends_at, sort: s.periods!.sort,
    subject: s.subjects?.name ?? "", teacher: s.profiles?.full_name ?? null,
    ...(withSection && s.sections ? { section: `${s.sections.classes.name}-${s.sections.name}` } : {}),
  };
}

// The live (draft) week of the timing in use: for one section, or for one teacher.
export async function liveWeek(supabase: SupabaseClient, by: { section?: string; teacher?: string }): Promise<Cell[]> {
  let q = supabase.from("timetable_slots").select(SLOT_COLS).eq("periods.timing_profiles.is_active", true);
  if (by.section) q = q.eq("section_id", by.section);
  if (by.teacher) q = q.eq("teacher_id", by.teacher);
  const { data } = await q;
  return ((data ?? []) as unknown as SlotRow[]).filter((s) => s.periods).map((s) => toCell(s, !!by.teacher));
}

// Every section's week, for confirming: section id -> cells.
export async function allWeeks(supabase: SupabaseClient) {
  const out = new Map<string, Cell[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("timetable_slots").select(SLOT_COLS).eq("periods.timing_profiles.is_active", true)
      .order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const s of (data ?? []) as unknown as SlotRow[]) {
      if (!s.periods) continue;
      out.set(s.section_id, [...(out.get(s.section_id) ?? []), toCell(s, false)]);
    }
    if ((data ?? []).length < 1000) return out;
  }
}

// The week parents and students see: the copy saved when the principal last confirmed.
export async function publishedWeek(supabase: SupabaseClient, sectionId: string) {
  const { data } = await supabase.from("published_timetables").select("grid, confirmed_at").eq("section_id", sectionId).maybeSingle();
  return data ? { cells: (data.grid ?? []) as Cell[], confirmedAt: data.confirmed_at as string } : null;
}

// Rows of the grid: each period once, in order, with the days that have any class.
export function gridShape(cells: Cell[]) {
  const periods = new Map<number, { period: string; starts_at: string; ends_at: string; sort: number }>();
  for (const c of cells) if (!periods.has(c.sort)) periods.set(c.sort, { period: c.period, starts_at: c.starts_at, ends_at: c.ends_at, sort: c.sort });
  const lastDay = Math.max(5, ...cells.map((c) => c.weekday));
  return {
    periods: [...periods.values()].sort((a, b) => a.sort - b.sort),
    days: DAYS.slice(0, lastDay).map((label, i) => ({ label, n: i + 1 })),
    at: new Map(cells.map((c) => [`${c.weekday}-${c.sort}`, c])),
  };
}

// 1 = Monday ... 7 = Sunday, for a yyyy-mm-dd date
export const weekdayOf = (date: string) => ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
