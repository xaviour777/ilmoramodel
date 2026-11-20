import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { ChildOverview } from "@/components/child-overview";
import { ChildSwitch, ParentTabs } from "@/components/family-tabs";
import { familyUrdu, KID_SELECT, type Kid } from "@/lib/learning";

// The full picture of one child (the earlier parent home): homework hand-in, all results, week timetable, 30 days.
export default async function ParentDetails({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const me = await requireRole("parent");
  const sp = await searchParams;
  const ur = await familyUrdu(me.role);
  const supabase = await createClient();
  const { data } = await supabase.from("students").select(KID_SELECT).eq("status", "enrolled").order("full_name");
  const kids = (data ?? []) as unknown as Kid[];
  const kid = kids.find((k) => k.id === sp.child) ?? kids[0];
  return (
    <>
      <div><h1 className="h1">{ur ? "پوری تفصیل" : "Full details"}</h1></div>
      <ParentTabs current="details" child={kid?.id} ur={ur} />
      <ChildSwitch kids={kids} current={kid?.id} path="/parent/details" />
      {kid ? <ChildOverview child={kid} /> : <p className="muted">No children linked to your account yet. Please contact the school office.</p>}
    </>
  );
}
