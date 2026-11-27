import { requireModule } from "@/lib/modules";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { BoardPrep } from "@/components/board-prep";

export default async function StudentBoard() {
  const me = await requireRole("student");
  await requireModule("board", "/student");
  const sb = await createClient();
  const { data } = await sb.from("students").select("id, full_name, sections(name, classes(name))").eq("profile_id", me.id).maybeSingle();
  return (
    <>
      <div><h1 className="h1">Board exam prep</h1><p className="muted text-base">Chapter by chapter readiness and timed mock tests.</p></div>
      {data ? <BoardPrep kid={data as never} /> : <p className="muted">Your account isn&apos;t linked to a student record yet.</p>}
    </>
  );
}
