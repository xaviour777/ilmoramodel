import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { FamilyExams } from "@/components/family-exams";
import { FamilyRoad } from "@/components/family-road";

export default async function ParentExams() {
  await requireRole("parent");
  const supabase = await createClient();
  const { data: kids } = await supabase.from("students").select("id, full_name, section_id, sections(name, class_id, classes(name))").eq("status", "enrolled").order("full_name");
  return (
    <>
      <div><h1 className="h1">Exams</h1><p className="muted text-base">Date sheets, admit cards and report cards for your children.</p></div>
      <FamilyRoad kids={(kids ?? []) as never} tutor="/parent/tutor" />
      <FamilyExams kids={(kids ?? []) as never} />
    </>
  );
}
