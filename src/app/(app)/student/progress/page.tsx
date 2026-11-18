import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { StudentProgress } from "@/components/student-progress";

export default async function MyProgress() {
  const me = await requireRole("student");
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("id, full_name, section_id, sections(name, classes(name))").eq("profile_id", me.id).maybeSingle();
  return (
    <>
      <div><h1 className="h1">My progress</h1><p className="muted text-base">Your target, today&apos;s plan, practice tests and badges.</p></div>
      {data ? <StudentProgress kid={data as never} /> : <p className="muted">Your account isn&apos;t linked to a student record yet.</p>}
    </>
  );
}
