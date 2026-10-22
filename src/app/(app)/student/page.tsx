import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { ChildOverview } from "@/components/child-overview";
import { NoticesList } from "@/components/notices-list";

export default async function StudentHome() {
  const me = await requireRole("student");
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("id, full_name, section_id, sections(name, classes(name))").eq("profile_id", me.id).maybeSingle();
  type Kid = { id: string; full_name: string; section_id: string | null; sections: { name: string; classes: { name: string } } | null };
  return (
    <>
      <h1 className="h1">Hi {me.full_name.split(" ")[0]}</h1>
      {data ? <ChildOverview child={data as unknown as Kid} /> : <p className="muted">Your account isn&apos;t linked to a student record yet.</p>}
      <NoticesList />
    </>
  );
}
