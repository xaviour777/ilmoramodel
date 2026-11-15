import Link from "next/link";
import { requireRole } from "@/lib/me";

// Every report the app can make, in one list (design/Reports.dc.html).
// Each link opens an existing page, print sheet or download.
const GROUPS = [
  { label: "Attendance", tile: "t-o", items: [
    { href: "/principal/attendance", n: "Attendance today and heatmap", d: "Every section, the last five school days" },
    { href: "/principal#follow-up", n: "Students to call", d: "3 or more absences in 3 weeks" },
    { href: "/principal/staff", n: "Staff attendance and leave", d: "Who is in, on leave and covering" },
  ] },
  { label: "Exams and results", tile: "t-v", items: [
    { href: "/principal/exams", n: "Results and report cards", d: "Print report cards for a class" },
    { href: "/principal/students/board", n: "Board registration", d: "Who is ready for the BISE portal" },
    { href: "/teacher/tutor-report", n: "Tutor report", d: "Where children got stuck in homework" },
  ] },
  { label: "Fees and money", tile: "t-g", items: [
    { href: "/accounts", n: "Fee desk", d: "Collections today and this month" },
    { href: "/accounts/calls", n: "Defaulters", d: "Families with a balance, with call notes" },
    { href: "/accounts/day-close", n: "Day close", d: "Cash counted against payments received" },
    { href: "/accounts/expenses", n: "Expenses", d: "By category, with CSV download" },
    { href: "/accounts/online", n: "Online payments", d: "JazzCash and Easypaisa claims" },
  ] },
  { label: "Staff and pay", tile: "t-b", items: [
    { href: "/principal/staff/salaries", n: "Salary sheet", d: "Make, check and pay; payslips" },
  ] },
  { label: "Admissions", tile: "t-p", items: [
    { href: "/principal/admissions", n: "Admissions pipeline", d: "Inquiries, tests, offers and admitted" },
  ] },
];

export default async function PrincipalReports() {
  await requireRole("principal", "owner");
  return (
    <>
      <div>
        <div className="kick">Money</div>
        <h1 className="h1 mt-1">Reports</h1>
        <p className="muted mt-1.5 text-[15px]">Every report in one place. Each one opens with its own dates, print and download.</p>
      </div>
      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {GROUPS.map((g) => (
          <section key={g.label} className="card">
            <h2 className="h2 flex items-center gap-2.5"><span className={`ilm-tile ${g.tile}`}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg></span>{g.label}</h2>
            <div className="mt-2">
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} className="flex items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2.5 hover:bg-[#f8fafc]">
                  <div className="min-w-0 flex-1"><div className="font-black">{i.n}</div><div className="muted text-[12px]">{i.d}</div></div>
                  <span className="text-[13px] font-black text-[#0369a1]">Open →</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
