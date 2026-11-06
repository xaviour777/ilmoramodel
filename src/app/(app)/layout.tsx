import { getMe, type Role } from "@/lib/me";
import { Nav, type NavItem } from "@/components/nav";
import { signOut } from "@/app/login/actions";
import { Avatar } from "@/components/avatar";
import Link from "next/link";
import { StitchNav, StitchNavRow, type StitchGroup, type StitchItem } from "@/components/stitch-nav";
import { createClient } from "@/lib/supabase/server";
import { todayPK } from "@/lib/format";

// Principal and owner sidebar (Stitch design). Every link is an existing page.
const STITCH_GROUPS: StitchGroup[] = [
  { title: "Overview", items: [{ href: "/principal", label: "Today", icon: "dashboard" }] },
  { title: "School", items: [
    { href: "/principal/classes", label: "Students & Classes", icon: "school", also: ["/principal/students"] },
    { href: "/principal/exams", label: "Exams", icon: "assignment" },
    { href: "/principal/admissions", label: "Admissions", icon: "person_add" },
    { href: "/principal/staff", label: "Staff & leave", icon: "badge" },
    { href: "/principal/notices", label: "Notices", icon: "campaign" },
  ] },
  { title: "Finance", items: [
    { href: "/accounts", label: "Fee desk", icon: "point_of_sale", also: ["/accounts/setup", "/accounts/messages"] },
    { href: "/accounts/online", label: "Online payments", icon: "task_alt" },
    { href: "/accounts/calls", label: "Defaulters", icon: "currency_exchange" },
    { href: "/accounts/day-close", label: "Day close", icon: "account_balance" },
    { href: "/accounts/expenses", label: "Expenses", icon: "receipt_long" },
  ] },
  { title: "Learning", items: [
    { href: "/teacher/paper-check", label: "Paper checking", icon: "fact_check" },
    { href: "/teacher/tutor-report", label: "Tutor report", icon: "cast_for_education" },
  ] },
];
const STITCH_FOOTER: StitchItem[] = [
  { href: "/settings", label: "Settings", icon: "settings", also: ["/profile"] },
];

const NAV: Record<Role, NavItem[]> = {
  principal: [
    { href: "/principal", label: "Today", icon: "home" },
    { href: "/principal/classes", label: "Classes", icon: "classes", also: ["/principal/students"] },
    { href: "/principal/exams", label: "Exams", icon: "star" },
    { href: "/teacher/paper-check", label: "Paper checking", icon: "pencil" },
    { href: "/teacher/tutor-report", label: "Tutor report", icon: "chat" },
    { href: "/principal/staff", label: "Staff & leave", icon: "people" },
    { href: "/principal/admissions", label: "Admissions", icon: "door" },
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
    { href: "/teacher/paper-check", label: "Paper checking", icon: "check" },
    { href: "/teacher/tutor-report", label: "Tutor report", icon: "chat" },
    { href: "/teacher/diary", label: "Diary & notes", icon: "pencil" },
    { href: "/teacher/leave", label: "Leave", icon: "clock" },
  ],
  parent: [
    { href: "/parent", label: "My children", icon: "home" },
    { href: "/parent/tutor", label: "Homework tutor", icon: "chat" },
  ],
  student: [
    { href: "/student", label: "Home", icon: "home" },
    { href: "/student/tutor", label: "Homework tutor", icon: "chat" },
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
          <div className="px-3 pb-2 text-3xl font-black tracking-tight lg:pb-4" style={{ color: "var(--green)" }}>ilmora</div>
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
  const { data: year } = await supabase.from("academic_sessions").select("name").eq("is_current", true).maybeSingle();
  const today = new Date(todayPK() + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="stitch min-h-screen bg-surface-container-lowest font-manrope text-body-md text-on-surface">
      {/* sidebar, large screens */}
      <aside className="fixed top-0 left-0 z-50 hidden h-screen w-60 flex-col bg-primary text-on-primary select-none lg:flex">
        <div className="border-b border-on-primary/10 p-space-md">
          <div className="flex items-center gap-space-sm">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-container text-headline-sm font-extrabold text-secondary-fixed">i</span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-headline-sm font-bold tracking-tight">Ilmora</span>
              <span className="mt-0.5 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-secondary-fixed" />
                <span className="truncate text-[11px] font-semibold text-on-primary-container">{me.campus_name}</span></span>
            </div>
          </div>
        </div>
        <StitchNav groups={STITCH_GROUPS} footer={STITCH_FOOTER} />
        <div className="border-t border-on-primary/5 p-space-sm">
          <div className="flex items-center justify-between rounded-lg bg-primary-container/40 px-2 py-1.5">
            <Link href="/profile" className="flex min-w-0 items-center gap-2">
              <Avatar name={me.full_name} url={me.avatar_url} size={28} />
              <span className="flex min-w-0 flex-col"><span className="truncate text-label-sm">{me.full_name}</span>
                <span className="truncate text-[10px] text-on-primary-container">{ROLE_LABEL[me.role]}</span></span>
            </Link>
            <form action={signOut}><button type="submit" aria-label="Sign out" title="Sign out" className="p-1 text-primary-fixed-dim hover:text-on-primary"><span className="msym text-[18px]">logout</span></button></form>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-60">
        <header className="sticky top-0 z-40 border-b border-surface-variant bg-surface-container-lowest/90 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-space-md px-4 lg:px-gutter-desktop">
            <div className="flex max-w-xl flex-1 items-center gap-space-md">
              <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                <span className="font-semibold text-primary">Ilmora</span>
                <span className="hidden text-outline-variant sm:inline">/</span>
                <span className="hidden truncate text-on-surface sm:inline">{me.campus_name}</span>
              </div>
              <form action="/principal/students" className="relative hidden max-w-md flex-1 md:block" role="search">
                <span className="msym absolute top-2.5 left-3 text-[18px] text-outline" aria-hidden="true">search</span>
                <input name="q" aria-label="Search students" placeholder="Search student, roll no, B-form, 0300..."
                  className="h-9 w-full rounded border border-surface-variant bg-surface pr-3 pl-9 text-body-sm text-on-surface placeholder:text-outline focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none" />
              </form>
            </div>
            <div className="flex items-center gap-space-sm">
              {year?.name && <span className="hidden items-center gap-1.5 rounded border border-surface-variant bg-surface px-2.5 py-1 text-label-sm xl:flex">
                <span className="msym text-[16px] text-outline" aria-hidden="true">calendar_month</span>{year.name}</span>}
              <span className="hidden rounded border border-surface-variant bg-surface px-2.5 py-1 text-label-sm text-on-surface-variant 2xl:inline">Today, {today}</span>
              <Link href="/principal#actions" aria-label="What needs you today" className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface hover:text-on-surface">
                <span className="msym text-[20px]">notifications</span></Link>
              <Link href="/profile" aria-label="My profile" className="border-l border-surface-variant pl-2"><Avatar name={me.full_name} url={me.avatar_url} size={32} /></Link>
              <form action={signOut} className="lg:hidden"><button type="submit" className="text-label-sm text-on-surface-variant underline">Sign out</button></form>
            </div>
          </div>
        </header>
        <div className="lg:hidden"><StitchNavRow groups={STITCH_GROUPS} footer={STITCH_FOOTER} /></div>
        <main className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col gap-5 px-4 py-space-lg lg:px-gutter-desktop">{children}</main>
      </div>
    </div>
  );
}
