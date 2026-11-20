import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { PassportView } from "@/components/passport-view";
import { ChildSwitch, ParentTabs } from "@/components/family-tabs";
import { familyUrdu, KID_SELECT, type Kid } from "@/lib/learning";
import { Flash } from "@/components/flash";

export default async function ParentPassport({ searchParams }: { searchParams: Promise<{ child?: string; saved?: string; error?: string }> }) {
  const me = await requireRole("parent");
  const sp = await searchParams;
  const ur = await familyUrdu(me.role);
  const supabase = await createClient();
  const { data } = await supabase.from("students").select(KID_SELECT).eq("status", "enrolled").order("full_name");
  const kids = (data ?? []) as unknown as Kid[];
  const kid = kids.find((k) => k.id === sp.child) ?? kids[0];
  return (
    <>
      <div><h1 className="h1">{ur ? "ماڈل پاسپورٹ" : "Model Passport"}</h1><p className="muted text-base">{ur ? "بچے کا سیکھنے کا سفر، نمبروں سے آگے" : "Your child's learning journey, beyond exam marks."}</p></div>
      <ParentTabs current="passport" child={kid?.id} ur={ur} />
      <ChildSwitch kids={kids} current={kid?.id} path="/parent/passport" />
      <Flash saved={sp.saved} error={sp.error} ur={ur} />
      {kid ? <PassportView kid={kid} role={me.role} meId={me.id} ur={ur} back={`/parent/passport?child=${kid.id}`} /> : <p className="muted">No children linked to your account yet.</p>}
    </>
  );
}
