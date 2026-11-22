import type { PGroup } from "./principal-nav";

// The owner's menu (design/Owner.dc.html).
export const OWNER_GROUPS: PGroup[] = [
  { label: "Group", items: [
    { id: "o-home", href: "/owner", label: "Overview", tile: "t-g", icon: "home" },
    { id: "o-campuses", href: "/owner/campuses", label: "Campuses", tile: "t-b", icon: "campus" },
    { id: "o-approvals", href: "/owner/approvals", label: "Approvals", tile: "t-o", icon: "check2" },
  ] },
  { label: "Money", items: [
    { id: "o-revenue", href: "/owner/revenue", label: "Revenue and fees", tile: "t-o", icon: "fees" },
    { id: "o-expenses", href: "/owner/expenses", label: "Expenses and payroll", tile: "t-p", icon: "staff" },
    { id: "o-pl", href: "/owner/pl", label: "Profit and loss", tile: "t-v", icon: "pl" },
  ] },
  { label: "School", items: [
    { id: "o-academics", href: "/owner/academics", label: "Academics", tile: "t-b", icon: "exams" },
    { id: "o-admissions", href: "/owner/admissions", label: "Admissions", tile: "t-p", icon: "adm" },
    { id: "o-people", href: "/owner/people", label: "Principals and staff", tile: "t-g", icon: "students" },
  ] },
  { label: "Admin", items: [
    { id: "o-wa", href: "/whatsapp", label: "WhatsApp", tile: "t-g", icon: "notices" },
    { id: "o-reports", href: "/owner/reports", label: "Reports", tile: "t-v", icon: "reports" },
    { id: "o-settings", href: "/owner/settings", label: "Group settings", tile: "t-n", icon: "settings" },
    { id: "o-campus", href: "/principal", label: "Open my campus", tile: "t-y", icon: "classes", also: ["/principal", "/accounts", "/settings"] },
  ] },
];
export const OWNER_TABS = ["o-home", "o-approvals", "o-revenue", "o-pl"];

// Owner and principal are the same person (super admin → school → "Owner is also the principal"):
// one dashboard with the principal's menu plus a Director group, and no "Director requests".
const DIRECTOR_IDS = ["o-home", "o-approvals", "o-campuses", "o-revenue", "o-expenses", "o-pl", "o-people", "o-settings"];
export function combinedGroups(principal: PGroup[]): PGroup[] {
  const director = OWNER_GROUPS.flatMap((g) => g.items).filter((i) => DIRECTOR_IDS.includes(i.id))
    .map((i) => (i.id === "o-home" ? { ...i, label: "Director overview" } : i.id === "o-settings" ? { ...i, label: "Director settings" } : i));
  const daily = principal.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== "ask") }));
  return [daily[0], { label: "Director", items: director }, ...daily.slice(1)];
}
