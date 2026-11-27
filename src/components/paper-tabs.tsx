import { Tabs } from "./tabs";

// Tests to scan, the question bank and board-style papers and the homework tutor report share the Papers & AI menu entry.
export function PaperTabs({ current }: { current: "tests" | "bank" | "papers" | "tutor" }) {
  return (
    <Tabs current={current} tabs={[
      { id: "tests", label: "Tests", href: "/teacher/paper-check" },
      { id: "bank", label: "Question bank", href: "/teacher/paper-check/bank" },
      { id: "papers", label: "Make a paper", href: "/teacher/paper-check/papers" },
      { id: "tutor", label: "Tutor report", href: "/teacher/tutor-report" },
    ]} />
  );
}
