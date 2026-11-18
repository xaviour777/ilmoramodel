import Link from "next/link";
import { requireSuper } from "@/lib/super";
import { signOut } from "@/app/login/actions";

// The platform admin's own area: every school on Ilmora.
export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuper();
  return (
    <div className="ilm min-h-screen">
      <header className="sticky top-0 z-30 border-b-2 border-[#e5e7eb] bg-white">
        <div className="mx-auto flex max-w-[1220px] flex-wrap items-center gap-3 px-4 py-3 lg:px-7">
          <Link href="/super" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#1f2937] text-[20px] font-black text-white shadow-[0_3px_0_#111827]">i</span>
            <span><span className="block text-[17px] font-black">Ilmora platform</span><span className="block text-[12px] font-bold text-[#6b7280]">Super admin</span></span>
          </Link>
          <nav className="ml-2 flex gap-1 text-[14px] font-extrabold">
            <Link href="/super" className="ilm-it">Schools</Link>
            <Link href="/super/new" className="ilm-it">Add school</Link>
            <Link href="/super/activity" className="ilm-it">Activity</Link>
          </nav>
          <span className="ml-auto text-[13px] font-bold text-[#6b7280]">{user.email}</span>
          <form action={signOut}><button className="text-[13px] font-extrabold text-[#0369a1] underline" type="submit">Sign out</button></form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1220px] flex-col gap-5 px-4 py-6 lg:px-7">{children}</main>
    </div>
  );
}
