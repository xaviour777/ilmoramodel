import { Tabs } from "./tabs";

// Staff, leave and attendance share one menu entry with the monthly salaries.
export function StaffTabs({ current }: { current: "staff" | "salaries" }) {
  return (
    <Tabs current={current} tabs={[
      { id: "staff", label: "Staff & leave", href: "/principal/staff" },
      { id: "salaries", label: "Salaries", href: "/principal/staff/salaries" },
    ]} />
  );
}
