import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { FamilyExams } from "@/components/family-exams";

export default async function StudentExams() {
  const me = await requireRole("student");
  const supabase = await createClient();
  const { data: kids } = await supabase.from("students").select("id, full_name, section_id, sections(name, class_id, classes(name))").eq("profile_id", me.id);
  return (
    <>
      <div><h1 className="h1">My exams</h1><p className="muted text-base">Your date sheet, admit card and report card.</p></div>
      <FamilyExams kids={(kids ?? []) as never} />
    </>
  );
}
