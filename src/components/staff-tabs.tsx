import { UnderTabs } from "./classes-tabs";

// Staff (design/Staff.dc.html): today, reports, and the monthly salaries page.
export function StaffTabs({ current }: { current: "staff" | "reports" | "salaries" }) {
  return (
    <UnderTabs current={current} tabs={[
      { id: "staff", label: "Today", href: "/principal/staff" },
      { id: "reports", label: "Reports", href: "/principal/staff?tab=reports" },
      { id: "salaries", label: "Salaries & payroll", href: "/principal/staff/salaries" },
    ]} />
  );
}
