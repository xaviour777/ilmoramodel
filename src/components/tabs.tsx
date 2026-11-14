import Link from "next/link";

// A row of page tabs. Styles live in globals.css (.tabs / .tab) so the principal screens can restyle them.
export function Tabs({ tabs, current }: { tabs: { href: string; label: string; id: string }[]; current: string }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} role="tab" aria-selected={t.id === current} className="tab">
          {t.label}
        </Link>
      ))}
    </div>
  );
}
