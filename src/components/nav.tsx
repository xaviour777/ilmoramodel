"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

// also: other pages that belong under this entry, so it stays lit there
export type NavItem = { href: string; label: string; icon: IconName; also?: string[] };

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  // the longest matching link is the current page
  const current = items
    .flatMap((i) => [i.href, ...(i.also ?? [])].map((p) => ({ owner: i.href, p })))
    .filter(({ p }) => path === p || path.startsWith(p + "/"))
    .sort((a, b) => b.p.length - a.p.length)[0]?.owner;
  return (
    <nav aria-label="Main" className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
      {items.map((i) => {
        const I = Icon[i.icon];
        return (
          <Link key={i.href} href={i.href} className="nav-item" aria-current={i.href === current ? "page" : undefined}>
            <I />
            <span>{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
