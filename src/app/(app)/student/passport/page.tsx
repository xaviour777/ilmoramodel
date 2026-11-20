import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { PassportView } from "@/components/passport-view";
import { StudentTabs } from "@/components/family-tabs";
import { familyUrdu, KID_SELECT, type Kid } from "@/lib/learning";
import { Flash } from "@/components/flash";

export default async function StudentPassport({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole("student");
  const sp = await searchParams;
  const ur = await familyUrdu(me.role);
  const supabase = await createClient();
  const { data } = await supabase.from("students").select(KID_SELECT).eq("profile_id", me.id).maybeSingle();
  return (
    <>
      <div><h1 className="h1">{ur ? "ماڈل پاسپورٹ" : "Model Passport"}</h1><p className="muted text-base">{ur ? "آپ کا سیکھنے کا سفر، نمبروں سے آگے" : "Your learning journey, beyond exam marks."}</p></div>
      <StudentTabs current="passport" ur={ur} />
      <Flash saved={sp.saved} error={sp.error} ur={ur} />
      {data ? <PassportView kid={data as unknown as Kid} role={me.role} meId={me.id} ur={ur} back="/student/passport" /> : <p className="muted">Your account isn&apos;t linked to a student record yet.</p>}
    </>
  );
}
