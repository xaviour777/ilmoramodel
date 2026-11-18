import { getMe, type Role } from "@/lib/me";
import { Nav, type NavItem } from "@/components/nav";
import { signOut } from "@/app/login/actions";
import { Avatar } from "@/components/avatar";
import Link from "next/link";
import { PrincipalSidebar, PrincipalBottomBar } from "@/components/principal-nav";
import { createClient } from "@/lib/supabase/server";
import { todayPK } from "@/lib/format";
import { getBranding } from "@/lib/branding";

const NAV: Record<Role, NavItem[]> = {
  principal: [
    { href: "/principal", label: "Today", icon: "home" },
    { href: "/principal/classes", label: "Classes", icon: "classes", also: ["/principal/students"] },
    { href: "/principal/exams", label: "Exams", icon: "star" },
    { href: "/teacher/paper-check", label: "Paper checking", icon: "pencil" },
    { href: "/teacher/tutor-report", label: "Tutor report", icon: "chat" },
    { href: "/principal/staff", label: "Staff & leave", icon: "people" },
    { href: "/principal/admissions", label: "Admissions", icon: "door" },
    { href: "/feedback", label: "Suggestions", icon: "chat" },
    { href: "/principal/notices", label: "Notices", icon: "bell" },
    { href: "/accounts", label: "Fees", icon: "coin", also: ["/accounts/setup"] },
    { href: "/settings", label: "Settings", icon: "gear", also: ["/accounts/messages", "/profile"] },
  ],
  owner: [],
  accountant: [
    { href: "/accounts", label: "Fee desk", icon: "coin", also: ["/accounts/setup", "/principal/staff/salaries"] },
    { href: "/accounts/messages", label: "WhatsApp & SMS", icon: "chat" },
    { href: "/principal/admissions", label: "Admissions", icon: "door" },
  ],
  teacher: [
    { href: "/teacher", label: "Attendance", icon: "check" },
    { href: "/teacher/homework", label: "Homework", icon: "book" },
    { href: "/teacher/marks", label: "Marks", icon: "star" },
    { href: "/teacher/class", label: "My class", icon: "people" },
    { href: "/teacher/plans", label: "Lesson plans", icon: "book" },
    { href: "/teacher/paper-check", label: "Paper checking", icon: "check" },
    { href: "/teacher/tutor-report", label: "Tutor report", icon: "chat" },
    { href: "/teacher/diary", label: "Diary & notes", icon: "pencil" },
    { href: "/teacher/leave", label: "Leave & pay", icon: "clock" },
    { href: "/teacher/requests", label: "Parents' requests", icon: "people" },
    { href: "/feedback", label: "Suggestions", icon: "chat" },
  ],
  parent: [
    { href: "/parent", label: "My children", icon: "home" },
    { href: "/parent/tutor", label: "Homework tutor", icon: "chat" },
    { href: "/parent/progress", label: "Progress & practice", icon: "star" },
    { href: "/parent/exams", label: "Exams & report card", icon: "star" },
    { href: "/parent/requests", label: "Leave & meetings", icon: "clock" },
    { href: "/feedback", label: "Complaints & ideas", icon: "chat" },
  ],
  student: [
    { href: "/student", label: "Home", icon: "home" },
    { href: "/student/tutor", label: "Homework tutor", icon: "chat" },
    { href: "/student/progress", label: "My progress", icon: "star" },
    { href: "/student/exams", label: "My exams", icon: "star" },
    { href: "/feedback", label: "Suggestions", icon: "chat" },
  ],
};
NAV.owner = NAV.principal;

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner", principal: "Principal", accountant: "Accountant",
  teacher: "Teacher", parent: "Parent", student: "Student",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (me.role === "principal" || me.role === "owner") return <PrincipalShell me={me}>{children}</PrincipalShell>;
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 p-4 lg:flex-row lg:items-start lg:p-6">
      <aside className="flex flex-col gap-2 lg:sticky lg:top-6 lg:w-56 lg:shrink-0">
        <div className="flex items-center justify-between lg:block">
          <div className="px-3 pb-2 text-3xl font-black tracking-tight lg:pb-4" style={{ color: "var(--green)" }}>{(await getBranding())?.name ?? "ilmora"}</div>
          <div className="flex items-center gap-1 lg:hidden">
            <Link href="/profile" aria-label="My profile" className="p-1"><Avatar name={me.full_name} url={me.avatar_url} size={36} /></Link>
            <form action={signOut}><button className="muted px-3 py-2 underline" type="submit">Sign out</button></form>
          </div>
        </div>
        <Nav items={NAV[me.role]} />
        <div className="mt-4 hidden border-t-2 px-3 pt-3 text-[13px] font-bold lg:block" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          <Link href="/profile" className="flex items-center gap-2.5 hover:underline">
            <Avatar name={me.full_name} url={me.avatar_url} size={40} />
            <span>{me.full_name}<br />{ROLE_LABEL[me.role]} · {me.campus_name}</span>
          </Link>
          <div className="mt-2 flex gap-3"><Link href="/profile" className="underline">My profile</Link><form action={signOut}><button className="underline" type="submit">Sign out</button></form></div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-5">{children}</main>
    </div>
  );
}

async function PrincipalShell({ me, children }: { me: Awaited<ReturnType<typeof getMe>>; children: React.ReactNode }) {
  const supabase = await createClient();
  const today = todayPK();
  const [year, campus, sections, sectionToday, leave, admissions, owing] = await Promise.all([
    supabase.from("academic_sessions").select("name").eq("is_current", true).maybeSingle(),
    supabase.from("campuses").select("name, schools(name)").eq("id", me.campus_id).maybeSingle(),
    supabase.from("sections").select("id", { count: "exact", head: true }),
    supabase.from("attendance_by_section_day").select("section_id, marked").eq("date", today),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("admissions").select("id", { count: "exact", head: true }).in("status", ["inquiry", "test", "offered"]),
    supabase.from("family_balances").select("family_id", { count: "exact", head: true }).gt("balance_paisa", 0),
  ]);
  const markedSections = (sectionToday.data ?? []).filter((s) => s.marked > 0).length;
  // only count unmarked sections once the school day has started (someone has marked)
  const unmarked = markedSections > 0 ? Math.max(0, (sections.count ?? 0) - markedSections) : 0;
  const badges = { att: unmarked, staff: leave.count ?? 0, adm: admissions.count ?? 0, fees: owing.count ?? 0 };
  const brand = await getBranding();
  const schoolName = brand?.name || (campus.data?.schools as unknown as { name: string } | null)?.name || me.campus_name || "Ilmora";
  const initials = me.full_name.replace(/^(dr|mr|mrs|ms|miss)\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return (
    <div className="ilm min-h-screen">
      <div className="hidden lg:block">
        <PrincipalSidebar badges={badges} school={schoolName} logo={brand?.logo_url} campus={me.campus_name} year={year.data?.name} name={me.full_name} role={ROLE_LABEL[me.role]} initials={initials} />
      </div>
      {/* phone header */}
      <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b-2 border-[#e5e7eb] bg-white px-4 pt-4 pb-2.5 lg:hidden">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-xl font-black text-white" style={{ background: "var(--brand, #16a34a)", boxShadow: "0 3px 0 var(--brand-lip, #15803d)" }}>{schoolName[0].toUpperCase()}</div>
        <div className="min-w-0 flex-1"><div className="truncate text-[17px] font-black">{schoolName}</div>
          <div className="truncate text-[12px] font-bold text-[#6b7280]">{me.campus_name}{year.data?.name ? ` · ${year.data.name}` : ""}</div></div>
        <Link href="/profile" aria-label="My profile"><Avatar name={me.full_name} url={me.avatar_url} size={36} /></Link>
        <form action={signOut}><button type="submit" className="text-[12px] font-extrabold text-[#0369a1] underline">Sign out</button></form>
      </header>
      <div className="lg:pl-[264px]">
        <div className="hidden justify-end gap-3 px-7 pt-4 text-[13px] font-extrabold lg:flex">
          <Link href="/profile" className="text-[#0369a1] hover:underline">My profile</Link>
          <form action={signOut}><button type="submit" className="cursor-pointer text-[#0369a1] hover:underline">Sign out</button></form>
        </div>
        <main className="mx-auto flex w-full max-w-[1220px] min-w-0 flex-col gap-5 px-4 pt-4 pb-28 lg:px-7 lg:pt-2 lg:pb-12">{children}</main>
      </div>
      <PrincipalBottomBar badges={badges} />
    </div>
  );
}
