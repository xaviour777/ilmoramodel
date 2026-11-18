import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { StudentProgress } from "@/components/student-progress";

export default async function ParentProgress({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  await requireRole("parent");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("id, full_name, section_id, sections(name, classes(name))").eq("status", "enrolled").order("full_name");
  const kids = (data ?? []) as never as { id: string; full_name: string; section_id: string | null; sections: { name: string; classes: { name: string } } | null }[];
  const kid = kids.find((k) => k.id === sp.child) ?? kids[0];
  return (
    <>
      <div><h1 className="h1">Progress and practice</h1><p className="muted text-base">Weak subjects, a target, today&apos;s plan and practice tests.</p></div>
      <div className="flex flex-wrap gap-2">{kids.map((k) => <a key={k.id} href={`/parent/progress?child=${k.id}`} className={`chip ${k.id === kid?.id ? "!border-[var(--blue-ring)] !bg-[var(--blue-soft)]" : ""}`}>{k.full_name.split(" ")[0]}</a>)}</div>
      {kid ? <StudentProgress kid={kid} /> : <p className="muted">No children linked to your account yet.</p>}
    </>
  );
}
