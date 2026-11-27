import { UnderTabs } from "./classes-tabs";

// Staff (design/Staff.dc.html): today, reports, the monthly salaries page and lesson observations.
export function StaffTabs({ current }: { current: "staff" | "reports" | "salaries" | "observe" }) {
  return (
    <UnderTabs current={current} tabs={[
      { id: "staff", label: "Today", href: "/principal/staff" },
      { id: "reports", label: "Reports", href: "/principal/staff?tab=reports" },
      { id: "salaries", label: "Salaries & payroll", href: "/principal/staff/salaries" },
      { id: "observe", label: "Lesson observation", href: "/principal/staff/observe" },
    ]} />
  );
}
