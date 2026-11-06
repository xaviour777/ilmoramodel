"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Grouped sidebar for the principal and owner (Stitch design).
// also: other pages that belong under this entry, so it stays lit there.
export type StitchItem = { href: string; label: string; icon: string; also?: string[] };
export type StitchGroup = { title: string; items: StitchItem[] };

function currentOwner(path: string, items: StitchItem[]) {
  // the longest matching link is the current page
  return items
    .flatMap((i) => [i.href, ...(i.also ?? [])].map((p) => ({ owner: i.href, p })))
    .filter(({ p }) => path === p || path.startsWith(p + "/"))
    .sort((a, b) => b.p.length - a.p.length)[0]?.owner;
}

export function StitchNav({ groups, footer }: { groups: StitchGroup[]; footer: StitchItem[] }) {
  const path = usePathname();
  const current = currentOwner(path, [...groups.flatMap((g) => g.items), ...footer]);
  const link = (i: StitchItem) => (
    <Link key={i.href} href={i.href} className="snav" aria-current={i.href === current ? "page" : undefined}>
      <span className="msym text-[18px]" aria-hidden="true">{i.icon}</span>
      <span>{i.label}</span>
    </Link>
  );
  return (
    <>
      <nav aria-label="Main" className="flex-1 space-y-space-md overflow-y-auto px-space-sm py-space-sm">
        {groups.map((g) => (
          <div key={g.title} className="space-y-space-xs">
            <div className="px-2 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-on-primary-container">{g.title}</div>
            {g.items.map(link)}
          </div>
        ))}
      </nav>
      <nav aria-label="Settings" className="space-y-0.5 border-t border-on-primary/10 p-space-sm">{footer.map(link)}</nav>
    </>
  );
}

// Phone and tablet: one scrolling row of the same links under the top bar.
export function StitchNavRow({ groups, footer }: { groups: StitchGroup[]; footer: StitchItem[] }) {
  const path = usePathname();
  const items = [...groups.flatMap((g) => g.items), ...footer];
  const current = currentOwner(path, items);
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto bg-primary px-3 pb-2">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="snav shrink-0" aria-current={i.href === current ? "page" : undefined}>
          <span className="msym text-[18px]" aria-hidden="true">{i.icon}</span>
          <span>{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
