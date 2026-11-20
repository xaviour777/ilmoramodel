// Extra tabs under "My class": Model Passport approvals and practice rules.
export const classExtraTabs = (section: string) => [
  { id: "passport", label: "Passport", href: `/teacher/class/passport?section=${section}` },
  { id: "practice", label: "Practice rules", href: `/teacher/class/practice?section=${section}` },
];
