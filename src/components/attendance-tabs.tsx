import { UnderTabs } from "./classes-tabs";

// Marking the class and scanning ID cards at the door share the teacher's Attendance menu entry.
export function AttendanceTabs({ current }: { current: "mark" | "scan" }) {
  return <UnderTabs current={current} tabs={[{ id: "mark", label: "Mark the class", href: "/teacher" }, { id: "scan", label: "Scan ID cards", href: "/teacher/scan" }]} />;
}
