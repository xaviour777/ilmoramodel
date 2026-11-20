import { createClient } from "@/lib/supabase/server";
import { mySections, type SectionOption } from "@/lib/teacher";
import type { Me } from "@/lib/me";

// A teacher's own sections; the principal or owner sees every section of the campus.
export async function classSections(me: Me): Promise<SectionOption[]> {
  if (me.role === "teacher") return mySections(me.id);
  const supabase = await createClient();
  const { data } = await supabase.from("sections").select("id, name, class_id, classes(name, sort)").limit(500);
  return ((data ?? []) as unknown as { id: string; name: string; class_id: string; classes: { name: string; sort: number } }[])
    .sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name))
    .map((s) => ({ id: s.id, label: `${s.classes.name}-${s.name}`, isClassTeacher: false, classId: s.class_id }));
}
