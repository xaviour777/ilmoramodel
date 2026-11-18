import Link from "next/link";

export function Tabs({ tabs, current }: { tabs: { href: string; label: string; id: string }[]; current: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} role="tab" aria-selected={t.id === current}
          className="inline-flex min-h-11 items-center rounded-xl border-2 bg-white px-4 text-sm font-black uppercase tracking-wide"
          style={t.id === current ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)", color: "var(--blue-ink)" } : { borderColor: "var(--line)" }}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
