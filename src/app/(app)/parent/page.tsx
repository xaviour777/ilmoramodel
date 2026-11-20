import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { ChildToday } from "@/components/child-today";
import { NoticesList } from "@/components/notices-list";
import { LiveRefresh } from "@/components/live-refresh";
import { ChildSwitch, ParentTabs } from "@/components/family-tabs";
import { familyUrdu, KID_SELECT, type Kid } from "@/lib/learning";

// My Child Today: one screen a parent understands in 30 seconds.
export default async function ParentHome({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const me = await requireRole("parent");
  const sp = await searchParams;
  const ur = await familyUrdu(me.role);
  const supabase = await createClient();
  const [{ data: kids }, { data: balances }, { data: invoice }] = await Promise.all([
    supabase.from("students").select(KID_SELECT).eq("status", "enrolled").order("full_name"),
    supabase.from("family_balances").select("family_id, balance_paisa"),
    supabase.from("invoices").select("challan_no, due_on").order("billing_month", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const list = (kids ?? []) as unknown as Kid[];
  const child = list.find((k) => k.id === sp.child) ?? list[0];
  const due = (balances ?? []).reduce((t, b) => t + Number(b.balance_paisa), 0);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Karachi" }).format(new Date()));
  const hi = ur ? (hour < 12 ? "صبح بخیر" : "السلام علیکم") : hour < 12 ? "Good morning" : "Assalam-o-Alaikum";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3" dir={ur ? "rtl" : "ltr"}>
        <div><h1 className="h1" lang={ur ? "ur" : "en"}>{hi}{ur ? "،" : ","} {me.full_name.split(" ")[0]}</h1>
          <p className="muted text-base" lang={ur ? "ur" : "en"}>{ur ? "آئیں آج کا دن اچھا بنائیں۔" : "Let's make today count."} · {me.campus_name}</p></div>
        <LiveRefresh tables={["attendance", "homework", "notices", "payments"]} />
      </div>
      <ParentTabs current="today" child={child?.id} ur={ur} />
      <ChildSwitch kids={list} current={child?.id} path="/parent" />
      {child ? <ChildToday kid={child} ur={ur} due={due} challan={invoice ?? null} /> : <p className="muted">No children linked to your account yet. Please contact the school office.</p>}
      <NoticesList />
    </>
  );
}
