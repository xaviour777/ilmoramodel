"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; ini: string; tile: string };
export const SUPER_GROUPS: { label: string; items: Item[] }[] = [
  { label: "Platform", items: [
    { href: "/super", label: "Overview", ini: "O", tile: "t-g" },
    { href: "/super/schools", label: "Schools", ini: "S", tile: "t-b" },
    { href: "/super/onboarding", label: "Trials and setup", ini: "T", tile: "t-g" },
  ] },
  { label: "Business", items: [
    { href: "/super/billing", label: "Billing and invoices", ini: "B", tile: "t-o" },
    { href: "/super/plans", label: "Plans and features", ini: "P", tile: "t-v" },
    { href: "/super/usage", label: "Usage and limits", ini: "U", tile: "t-y" },
  ] },
  { label: "Care", items: [
    { href: "/super/announcements", label: "Announcements", ini: "A", tile: "t-p" },
  ] },
  { label: "Safety", items: [
    { href: "/super/security", label: "Security and audit", ini: "L", tile: "t-p" },
  ] },
];

const ALL = SUPER_GROUPS.flatMap((g) => g.items);
function current(path: string) {
  if (path === "/super") return "/super";
  if (path === "/super/new" || /^\/super\/[0-9a-f-]{36}/.test(path)) return "/super/schools";
  return ALL.filter((i) => i.href !== "/super" && path.startsWith(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "";
}

export function SuperSidebar({ email, badges }: { email: string; badges: Record<string, number> }) {
  const cur = current(usePathname());
  return (
    <nav aria-label="Main" className="ilm-side">
      <Link href="/super" className="flex items-center gap-2.5 px-1.5 pt-1 pb-3">
        <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[14px] bg-[#0f172a] text-[22px] font-black text-white shadow-[0_4px_0_#000]">i</span>
        <span className="min-w-0"><span className="block text-[17px] font-black">Ilmora platform</span><span className="block text-[12px] font-bold text-[#6b7280]">Super admin</span></span>
      </Link>
      {SUPER_GROUPS.map((g) => (
        <div key={g.label} className="flex flex-col gap-1">
          <div className="ilm-grp">{g.label}</div>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className="ilm-it" aria-current={i.href === cur ? "page" : undefined}>
              <span className={`ilm-tile ${i.tile} text-[13px] font-black`} style={{ width: 30, height: 30 }}>{i.ini}</span>
              <span className="truncate">{i.label}</span>
              {badges[i.href] > 0 && <span className="ilm-badge" aria-label={`${badges[i.href]} need you`}>{badges[i.href]}</span>}
            </Link>
          ))}
        </div>
      ))}
      <div className="mt-auto flex items-center gap-2.5 pt-4">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#0f172a] text-[13px] font-black text-white">SA</span>
        <span className="min-w-0"><span className="block truncate text-[14px] font-black text-[#1f2937]">{email}</span><span className="block text-[12px] font-bold text-[#6b7280]">Super admin</span></span>
      </div>
    </nav>
  );
}

// Phones: one scrolling row of all pages under the header.
export function SuperTopNav({ badges }: { badges: Record<string, number> }) {
  const cur = current(usePathname());
  return (
    <nav aria-label="Pages" className="flex gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
      {ALL.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.href === cur ? "page" : undefined}
          className={`inline-flex min-h-10 flex-none items-center gap-1.5 rounded-xl border-2 px-3 text-[13px] font-extrabold whitespace-nowrap ${i.href === cur
            ? "border-[#7dd3fc] bg-[#e0f2fe] text-[#0369a1]" : "border-[#e5e7eb] bg-white text-[#4b5563]"}`}>
          {i.label}{badges[i.href] > 0 && <span className="rounded-full bg-[#ef4444] px-1.5 text-[11px] font-black text-white">{badges[i.href]}</span>}
        </Link>
      ))}
    </nav>
  );
}
