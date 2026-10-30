import { Tabs } from "./tabs";

// Classes, students, board registration, timings and timetable sit under one menu entry.
export function ClassesTabs({ current }: { current: string }) {
  return (
    <Tabs current={current} tabs={[
      { id: "classes", label: "Classes", href: "/principal/classes" },
      { id: "students", label: "Students", href: "/principal/students" },
      { id: "board", label: "Board registration", href: "/principal/students/board" },
      { id: "timings", label: "Timings", href: "/principal/classes?tab=timings" },
      { id: "timetable", label: "Timetable", href: "/principal/classes?tab=timetable" },
    ]} />
  );
}
