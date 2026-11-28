"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Principal and owner menu: sidebar on desktop, bottom bar on phones
// (design/Sidebar.dc.html and design/Mobile.dc.html).
import { PRINCIPAL_GROUPS, type PGroup, type PItem } from "./principal-groups";
export type { PGroup, PItem };

const I: Record<string, string> = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  att: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  notices: "M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8",
  classes: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
  exams: "M9 3h6v4H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4",
  ai: "M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z",
  students: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  staff: "M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18",
  adm: "M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6",
  fees: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M17 14h.01",
  reports: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  settings: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4",
  more: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  campus: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
  check2: "M20 6L9 17l-5-5",
  pl: "M3 3v18h18M7 15l4-4 3 3 5-6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  chev: "M9 6l6 6-6 6",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  van: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  shop: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  director: "M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.5 6.5 19.5l1-6.3L3 8.9 9 8z",
};

const ALL = PRINCIPAL_GROUPS.flatMap((g) => g.items);

function currentId(path: string, all: PItem[] = ALL) {
  // the longest matching link is the current page
  return all.flatMap((i) => [i.href, ...(i.also ?? [])].map((p) => ({ id: i.id, p })))
    .filter(({ p }) => path === p || path.startsWith(p + "/"))
    .sort((a, b) => b.p.length - a.p.length)[0]?.id;
}

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={I[name] ?? I.more} />
    </svg>
  );
}

const fmt = (n: number) => (n > 999 ? "999+" : String(n));

const groupTitle = (l: string) => (l === "" ? "Main" : l === "_bottom" ? "Settings" : l);
const sum = (items: PItem[], badges: Record<string, number>) => items.reduce((t, i) => t + (badges[i.id] > 0 ? badges[i.id] : 0), 0);

export function PrincipalSidebar({ badges, school, logo, campus, year, name, role, initials, groups = PRINCIPAL_GROUPS }: {
  badges: Record<string, number>; school: string; logo?: string | null; campus: string; year?: string | null; name: string; role: string; initials: string; groups?: PGroup[];
}) {
  const all = groups.flatMap((g) => g.items);
  const path = usePathname();
  const cur = currentId(path, all);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const find = useRef<HTMLInputElement>(null);
  useEffect(() => { try { setOpen(JSON.parse(localStorage.getItem("ilm-nav-open") ?? "{}")); } catch { /* private mode */ } }, []);
  useEffect(() => setQ(""), [path]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); find.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const toggle = (l: string, now: boolean) => {
    const next = { ...open, [l]: !now };
    setOpen(next);
    try { localStorage.setItem("ilm-nav-open", JSON.stringify(next)); } catch { /* private mode */ }
  };
  const hits = q.trim() ? groups.flatMap((g) => g.items.map((i) => ({ i, g: groupTitle(g.label) })))
    .filter(({ i, g }) => `${i.label} ${g}`.toLowerCase().includes(q.trim().toLowerCase())) : null;
  const link = (i: PItem, sub?: string) => (
    <Link key={i.id} href={i.href} className="ilm-it" aria-current={i.id === cur ? "page" : undefined}>
      <span className={`ilm-tile ${i.tile}`}><Icon name={i.icon} size={18} /></span>
      <span className="min-w-0 truncate">{i.label}{sub && <span className="block text-[11px] font-bold text-[#9ca3af]">{sub}</span>}</span>
      {badges[i.id] > 0 && <span className="ilm-badge" aria-label={`${badges[i.id]} waiting`}>{fmt(badges[i.id])}</span>}
    </Link>
  );
  const bottom = groups.filter((g) => g.label === "_bottom").flatMap((g) => g.items);
  return (
    <nav aria-label="Main" className="ilm-side">
      <div className="flex items-center gap-2.5 px-1.5 pt-1 pb-3">
        {logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logo} alt="" className="h-[40px] w-[40px] flex-none rounded-[12px] object-contain" />
          : <div className="flex h-[40px] w-[40px] flex-none items-center justify-center rounded-[12px] text-[20px] font-black text-white" style={{ background: "var(--brand, #16a34a)", boxShadow: "0 3px 0 var(--brand-lip, #15803d)" }}>{(school || "I")[0].toUpperCase()}</div>}
        <div className="min-w-0">
          <div className="truncate text-[16px] font-black" style={{ color: "var(--brand-lip, #15803d)" }}>{school}</div>
          <div className="truncate text-[12px] font-bold text-[#6b7280]">{[campus, year].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      <label className="ilm-find">
        <Icon name="search" size={16} />
        <input ref={find} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a page" aria-label="Find a page"
          onKeyDown={(e) => { if (e.key === "Enter" && hits?.[0]) router.push(hits[0].i.href); if (e.key === "Escape") setQ(""); }} />
        <kbd>/</kbd>
      </label>
      {hits ? (
        <div className="flex flex-col gap-0.5">
          {hits.length === 0 && <div className="px-3 py-2 text-[13px] font-bold text-[#6b7280]">No page called &ldquo;{q}&rdquo;</div>}
          {hits.map(({ i, g }) => link(i, g))}
        </div>
      ) : groups.filter((g) => g.label !== "_bottom").map((g, n) => {
        // the first group (Daily) always stays open; the others fold
        if (n === 0) return <div key={g.label || "main"} className="flex flex-col gap-0.5">{g.label && <div className="ilm-grp">{g.label}</div>}{g.items.map((i) => link(i))}</div>;
        const here = g.items.some((i) => i.id === cur);
        const isOpen = here || (open[g.label] ?? g.label !== "Director");
        const waiting = sum(g.items, badges);
        return (
          <div key={g.label} className="flex flex-col gap-0.5">
            <button type="button" className="ilm-grp" aria-expanded={isOpen} onClick={() => !here && toggle(g.label, isOpen)}>
              <span className="flex-1 text-left">{g.label}</span>
              {!isOpen && waiting > 0 && <span className="ilm-dot" aria-label={`${waiting} waiting`} />}
              {!here && <span className="ilm-chev" data-open={isOpen}><Icon name="chev" size={14} /></span>}
            </button>
            {isOpen && g.items.map((i) => link(i))}
          </div>
        );
      })}
      <div className="mt-auto flex flex-col gap-0.5 border-t-2 border-[#f1f5f9] pt-3">
        {!hits && bottom.map((i) => link(i))}
        <Link href="/profile" className="flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 hover:bg-[#f1f5f9]">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#dcfce7] text-[13px] font-black text-[#15803d]">{initials}</span>
          <span className="min-w-0"><span className="block truncate text-[14px] font-black text-[#1f2937]">{name}</span><span className="block truncate text-[12px] font-bold text-[#6b7280]">{role}</span></span>
        </Link>
      </div>
    </nav>
  );
}

const TABS = ["home", "classes", "exams", "staff"];

export function PrincipalBottomBar({ badges, groups = PRINCIPAL_GROUPS, tabs = TABS }: { badges: Record<string, number>; groups?: PGroup[]; tabs?: string[] }) {
  const path = usePathname();
  const ALL = groups.flatMap((g) => g.items);
  const TABS = tabs;
  const cur = currentId(path, ALL);
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [path]);
  const inMore = !!cur && !TABS.includes(cur);
  const moreBadge = ALL.filter((i) => !TABS.includes(i.id)).reduce((t, i) => t + (badges[i.id] > 0 ? 1 : 0), 0);
  return (
    <>
      {more && (
        <div className="fixed inset-x-0 top-0 bottom-[76px] z-40 overflow-y-auto bg-[#f7f9fc] p-4" role="dialog" aria-label="All pages">
          {groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="kick mt-1 mb-2">{groupTitle(g.label)}</div>
              <div className="grid grid-cols-3 gap-2.5">
                {g.items.map((i) => (
                  <Link key={i.id} href={i.href} className="ilm-mi" onClick={() => setMore(false)}>
                    <span className={`ilm-tile ${i.tile}`} style={{ width: 44, height: 44, borderRadius: 14 }}><Icon name={i.icon} size={22} /></span>
                    {i.label}
                    {badges[i.id] > 0 && <span className="ilm-badge">{fmt(badges[i.id])}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <nav aria-label="Main" className="ilm-tabs lg:hidden">
        {TABS.map((id) => {
          const i = ALL.find((x) => x.id === id)!;
          const on = !more && cur === id;
          return (
            <Link key={id} href={i.href} className="ilm-tb" aria-current={on ? "page" : undefined}>
              <span className="ic"><Icon name={i.icon} size={22} />{badges[id] > 0 && <span className="ilm-badge">{fmt(badges[id])}</span>}</span>
              {id === "staff" ? "Staff" : i.label.split(" ")[0]}
            </Link>
          );
        })}
        <button type="button" className="ilm-tb" aria-expanded={more} aria-current={more || inMore ? "page" : undefined} onClick={() => setMore(!more)}>
          <span className="ic"><Icon name="more" size={22} />{moreBadge > 0 && !more && <span className="ilm-badge">{moreBadge}</span>}</span>
          More
        </button>
      </nav>
    </>
  );
}
