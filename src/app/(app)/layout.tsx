import { getMe, type Role } from "@/lib/me";
import { Nav, type NavItem } from "@/components/nav";
import { signOut } from "@/app/login/actions";
import { Avatar } from "@/components/avatar";
import Link from "next/link";

const NAV: Record<Role, NavItem[]> = {
  principal: [
    { href: "/principal", label: "Today", icon: "home" },
    { href: "/principal/classes", label: "Classes", icon: "classes" },
    { href: "/principal/exams", label: "Exams", icon: "star" },
    { href: "/teacher/paper-check", label: "Paper checking", icon: "pencil" },
    { href: "/teacher/tutor-report", label: "Tutor report", icon: "chat" },
    { href: "/principal/staff", label: "Staff & leave", icon: "people" },
    { href: "/principal/admissions", label: "Admissions", icon: "door" },
    { href: "/principal/notices", label: "Notices", icon: "bell" },
    { href: "/accounts", label: "Fees", icon: "coin" },
    { href: "/settings", label: "Settings", icon: "gear", also: ["/accounts/messages", "/profile"] },
  ],
  owner: [],
  accountant: [
    { href: "/accounts", label: "Fee desk", icon: "coin" },
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
