import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { BoardPrep } from "@/components/board-prep";

export default async function ParentBoard() {
  await requireRole("parent");
  const sb = await createClient();
  const { data } = await sb.from("students").select("id, full_name, sections(name, classes(name))").eq("status", "enrolled").order("full_name");
  return (
    <>
      <div><h1 className="h1">Board exam prep</h1><p className="muted text-base">How ready each child is, subject by subject, with timed mock tests.</p></div>
      {(data ?? []).length === 0 && <p className="muted">No children linked to your account yet.</p>}
      {(data ?? []).map((k) => <BoardPrep key={k.id} kid={k as never} />)}
    </>
  );
}
