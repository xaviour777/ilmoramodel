"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName };

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  // the longest matching link is the current page
  const current = items
    .filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
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
