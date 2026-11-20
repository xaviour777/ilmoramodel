import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { LearningSpace } from "@/components/learning-space";
import { NoticesList } from "@/components/notices-list";
import { StudentTabs } from "@/components/family-tabs";
import { familyUrdu, KID_SELECT, type Kid } from "@/lib/learning";

export default async function StudentHome() {
  const me = await requireRole("student");
  const ur = await familyUrdu(me.role);
  const supabase = await createClient();
  const { data } = await supabase.from("students").select(KID_SELECT).eq("profile_id", me.id).maybeSingle();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Karachi" }).format(new Date()));
  const hi = ur ? "السلام علیکم" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <>
      <div><h1 className="h1">{hi}, {me.full_name.split(" ")[0]} 👋</h1><p className="muted text-base">{ur ? "آج کا دن، آپ کی ترقی اور آپ کا سفر" : "Your day, your progress and your learning journey."}</p></div>
      <StudentTabs current="today" ur={ur} />
      {data ? <LearningSpace kid={data as unknown as Kid} ur={ur} /> : <p className="muted">Your account isn&apos;t linked to a student record yet.</p>}
      <NoticesList />
    </>
  );
}
