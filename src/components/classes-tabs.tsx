import Link from "next/link";

// Tabs under Classes (design/Classes.dc.html): Classes, Timetable, Bell timings, plus board registration.
const TABS = [
  { id: "classes", label: "Classes", href: "/principal/classes" },
  { id: "timetable", label: "Timetable", href: "/principal/classes?tab=timetable" },
  { id: "timings", label: "Bell timings", href: "/principal/classes?tab=timings" },
  { id: "board", label: "Board registration", href: "/principal/students/board" },
];

export function ClassesTabs({ current }: { current: string }) {
  return <UnderTabs tabs={TABS} current={current} />;
}

export function UnderTabs({ tabs, current }: { tabs: { id: string; label: string; href: string }[]; current: string }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b-2 border-[#e5e7eb]" aria-label="Sections of this page">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === current ? "page" : undefined}
          className={`-mb-0.5 inline-flex min-h-11 items-center border-b-4 px-4 text-[15px] font-black ${t.id === current ? "border-[#38bdf8] text-[#0369a1]" : "border-transparent text-[#6b7280] hover:text-[#1f2937]"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
