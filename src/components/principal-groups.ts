// The principal's menu, kept out of the client component so server code can filter it.
export type PItem = { id: string; href: string; label: string; tile: string; icon: string; also?: string[] };
export type PGroup = { label: string; items: PItem[] };

export const PRINCIPAL_GROUPS: PGroup[] = [
  { label: "Daily", items: [
    { id: "home", href: "/principal", label: "Home", tile: "t-g", icon: "home" },
    { id: "att", href: "/principal/attendance", label: "Attendance", tile: "t-o", icon: "att" },
    { id: "notices", href: "/principal/notices", label: "Notices & holidays", tile: "t-p", icon: "notices" },
    { id: "wa", href: "/accounts/messages", label: "Messages", tile: "t-g", icon: "notices", also: ["/whatsapp"] },
    { id: "ask", href: "/principal/approvals", label: "Ask the owner", tile: "t-o", icon: "staff" },
    { id: "care", href: "/principal/care", label: "Complaints & transport", tile: "t-y", icon: "staff" },
  ] },
  { label: "Academics", items: [
    { id: "classes", href: "/principal/classes", label: "Classes", tile: "t-b", icon: "classes" },
    { id: "exams", href: "/principal/exams", label: "Exams", tile: "t-v", icon: "exams", also: ["/teacher/paper-check", "/teacher/tutor-report"] },
  ] },
  { label: "People", items: [
    { id: "students", href: "/principal/students", label: "Students", tile: "t-g", icon: "students" },
    { id: "staff", href: "/principal/staff", label: "Staff & pay", tile: "t-b", icon: "staff" },
    { id: "adm", href: "/principal/admissions", label: "Admissions", tile: "t-p", icon: "adm" },
  ] },
  { label: "Money", items: [
    { id: "fees", href: "/accounts", label: "Fees", tile: "t-o", icon: "fees" },
    { id: "reports", href: "/principal/reports", label: "Reports", tile: "t-v", icon: "reports" },
    { id: "settings", href: "/settings", label: "Settings", tile: "t-n", icon: "settings", also: ["/profile", "/principal/ai"] },
  ] },
];

