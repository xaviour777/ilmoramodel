"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/login/actions";
import { InstallAppButton } from "@/components/pwa";

// Grouped sidebar for the principal and owner (Stitch design).
// also: other pages that belong under this entry, so it stays lit there.
export type StitchItem = { href: string; label: string; icon: string; also?: string[]; exact?: boolean };
export type StitchGroup = { title: string; items: StitchItem[] };

function currentOwner(path: string, items: StitchItem[]) {
  // the longest matching link is the current page
  return items
    .flatMap((i) => [i.href, ...(i.also ?? [])].map((p) => ({ owner: i.href, p, exact: i.exact && p === i.href })))
    .filter(({ p, exact }) => path === p || (!exact && path.startsWith(p + "/")))
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

// Phone and tablet: a bottom bar with the four most used places and a "More" sheet with everything.
export function StitchBottomNav({ groups, footer, main }: { groups: StitchGroup[]; footer: StitchItem[]; main: StitchItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const all = [...groups.flatMap((g) => g.items), ...footer];
  const current = currentOwner(path, all);
  const mainCurrent = currentOwner(path, main);
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-primary/40 lg:hidden" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="All pages" className="max-h-[80vh] overflow-y-auto rounded-t-2xl bg-primary px-3 pt-3 pb-[calc(5rem+env(safe-area-inset-bottom))] text-on-primary" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-on-primary/30" />
            {[...groups, { title: "Settings", items: footer }].map((g) => (
              <div key={g.title} className="mb-3">
                <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-on-primary-container">{g.title}</div>
                <div className="grid grid-cols-2 gap-1">
                  {g.items.map((i) => (
                    <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="snav min-h-11" aria-current={i.href === current ? "page" : undefined}>
                      <span className="msym text-[20px]" aria-hidden="true">{i.icon}</span><span className="truncate">{i.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <InstallAppButton className="snav mb-2 min-h-11 w-full bg-secondary-fixed/20" />
            <form action={signOut} className="border-t border-on-primary/10 pt-2">
              <button type="submit" className="snav min-h-11 w-full"><span className="msym text-[20px]" aria-hidden="true">logout</span>Sign out</button>
            </form>
          </div>
        </div>
      )}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[70] grid grid-cols-5 border-t border-surface-variant bg-surface-container-lowest/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {main.map((i) => {
          const on = !open && i.href === mainCurrent;
          return (
            <Link key={i.href} href={i.href} onClick={() => setOpen(false)} aria-current={on ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${on ? "text-primary" : "text-on-surface-variant"}`}>
              <span className={`msym grid h-7 w-14 place-items-center rounded-full text-[22px] ${on ? "bg-secondary-fixed/60" : ""}`} aria-hidden="true">{i.icon}</span>
              {i.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${open || (current && !mainCurrent) ? "text-primary" : "text-on-surface-variant"}`}>
          <span className={`msym grid h-7 w-14 place-items-center rounded-full text-[22px] ${open ? "bg-secondary-fixed/60" : ""}`} aria-hidden="true">{open ? "close" : "menu"}</span>
          More
        </button>
      </nav>
    </>
  );
}
