import { createClient } from "@/lib/supabase/server";

export type SectionOption = { id: string; label: string; isClassTeacher: boolean; classId: string };

// Sections the teacher teaches: class-teacher sections first, then subject sections.
export async function mySections(meId: string): Promise<SectionOption[]> {
  const supabase = await createClient();
  const [{ data: own }, { data: taught }] = await Promise.all([
    supabase.from("sections").select("id, name, class_id, classes(name, sort)").eq("class_teacher_id", meId),
    supabase.from("section_subjects").select("sections(id, name, class_id, classes(name, sort))").eq("teacher_id", meId),
  ]);
  type Row = { id: string; name: string; class_id: string; classes: { name: string; sort: number } };
  const map = new Map<string, SectionOption & { sort: number }>();
  for (const s of (own ?? []) as unknown as Row[]) {
    map.set(s.id, { id: s.id, label: `${s.classes.name}-${s.name}`, isClassTeacher: true, classId: s.class_id, sort: s.classes.sort });
  }
  for (const r of (taught ?? []) as unknown as { sections: Row }[]) {
    const s = r.sections;
    if (s && !map.has(s.id)) map.set(s.id, { id: s.id, label: `${s.classes.name}-${s.name}`, isClassTeacher: false, classId: s.class_id, sort: s.classes.sort });
  }
  return [...map.values()]
    .sort((a, b) => Number(b.isClassTeacher) - Number(a.isClassTeacher) || a.sort - b.sort || a.label.localeCompare(b.label))
    .map((s) => ({ id: s.id, label: s.label, isClassTeacher: s.isClassTeacher, classId: s.classId }));
}
