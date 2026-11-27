import { UnderTabs } from "./classes-tabs";

// Weekly plans, the whole-year syllabus and the lesson diary share the teacher's Lessons menu entry.
export function LessonTabs({ current }: { current: "week" | "syllabus" | "diary" }) {
  return (
    <UnderTabs current={current} tabs={[
      { id: "week", label: "Weekly plans", href: "/teacher/plans" },
      { id: "syllabus", label: "Whole-year syllabus", href: "/teacher/plans/syllabus" },
      { id: "diary", label: "Diary & notes", href: "/teacher/diary" },
    ]} />
  );
}
