import Link from "next/link";
import { requireSuper, type SchoolRow } from "@/lib/super";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { todayPK } from "@/lib/format";
import { SuperSidebar, SuperTopNav } from "@/components/super-nav";

// The platform admin's own area: every school on Prinqo.
export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuper();
  const supabase = await createClient();
  const { data } = await supabase.rpc("super_schools");
  const rows = (data ?? []) as (SchoolRow & { overdue?: number })[];
  const today = todayPK();
  const week = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
  const badges: Record<string, number> = {
    "/super/onboarding": rows.filter((s) => s.status === "trial" && !!s.trial_ends_on && s.trial_ends_on <= week).length,
    "/super/billing": rows.filter((s) => (s.overdue ?? 0) > 0).length,
  };
  return (
    <div className="ilm min-h-screen">
      <div className="hidden lg:block"><SuperSidebar email={user.email ?? ""} badges={badges} /></div>
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b-2 border-[#e5e7eb] bg-white lg:static lg:border-0 lg:bg-transparent">
          <div className="mx-auto flex max-w-[1220px] items-center gap-3 px-4 py-3 lg:px-7 lg:pt-5 lg:pb-0">
            <Link href="/super" className="flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#0f172a] text-[18px] font-black text-white">i</span>
              <span className="text-[16px] font-black">Prinqo AI platform</span>
            </Link>
            <span className="ml-auto hidden text-[13px] font-bold text-[#6b7280] sm:inline">{user.email}</span>
            <form action={signOut} className="ml-auto sm:ml-0"><button className="min-h-10 text-[13px] font-extrabold text-[#0369a1] underline" type="submit">Sign out</button></form>
          </div>
          <SuperTopNav badges={badges} />
        </header>
        <main className="mx-auto flex w-full max-w-[1220px] flex-col gap-5 px-4 py-6 lg:px-7">{children}</main>
      </div>
    </div>
  );
}
