import Link from "next/link";
import { PERIODS, qs, type OwnerSearch, type Scored } from "@/lib/owner";

// Campus and period filter shared by every owner screen.
export function OwnerFilter({ base, sp, all, camp, period }: { base: string; sp: OwnerSearch; all: Scored[]; camp: string; period: string }) {
  return (
    <div className="card flex-row flex-wrap items-center gap-2 py-3">
      <span className="kick mr-1">Show</span>
      {[{ id: "all", name: "All campuses" }, ...all].map((c) => (
        <Link key={c.id} href={base + qs(sp, { c: c.id })} className={`pill ${camp === c.id ? "pill-blue" : "pill-gray"}`}>{c.name}</Link>
      ))}
      <span className="mx-1 hidden h-6 w-px bg-[#e5e7eb] sm:block" />
      {PERIODS.map((p) => <Link key={p.id} href={base + qs(sp, { p: p.id })} className={`pill ${period === p.id ? "pill-purple" : "pill-gray"}`}>{p.label}</Link>)}
    </div>
  );
}

export function Kpis({ items }: { items: { l: string; v: React.ReactNode; n?: React.ReactNode; c?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((k) => (
        <div key={k.l} className="rounded-2xl border-2 bg-white px-3.5 py-3" style={{ borderColor: "#e5e7eb" }}>
          <div className="text-[12px] font-extrabold uppercase tracking-wide text-[#6b7280]">{k.l}</div>
          <div className="text-[24px] font-black tabular-nums" style={{ color: k.c ?? "#1f2937" }}>{k.v}</div>
          {k.n && <div className="text-[12px] font-bold text-[#6b7280]">{k.n}</div>}
        </div>
      ))}
    </div>
  );
}

// Horizontal bars (CSS only).
export function HBars({ items, empty }: { items: { n: string; v: number; label: string; c?: string }[]; empty?: string }) {
  if (!items.length) return <p className="muted">{empty ?? "No data yet."}</p>;
  const mx = Math.max(1, ...items.map((i) => Math.abs(i.v)));
  return (
    <div className="flex flex-col">
      {items.map((i) => (
        <div key={i.n} className="flex items-center gap-2 py-1.5 text-[13px] font-extrabold">
          <span className="w-32 shrink-0 truncate">{i.n}</span>
          <span className="h-3.5 flex-1 overflow-hidden rounded-full bg-[#eef2f7]"><i className="block h-full rounded-full" style={{ width: `${Math.round((Math.abs(i.v) / mx) * 100)}%`, background: i.c ?? (i.v < 0 ? "#ef4444" : "#0ea5e9") }} /></span>
          <span className="w-28 shrink-0 text-right tabular-nums">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

export function OwnerHead({ group, title, sub, children }: { group: string; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><div className="kick">{group}</div><h1 className="h1">{title}</h1><p className="muted text-base">{sub}</p></div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Notes({ title = "AI · what needs you", items }: { title?: string; items: string[] }) {
  return (
    <section className="card" style={{ background: "#1f2937", borderColor: "#1f2937", color: "#f9fafb" }}>
      <h2 className="h2" style={{ color: "#fcd34d" }}>{title}</h2>
      {items.length ? <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[14px] font-bold">{items.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="text-sm font-bold opacity-80">Nothing stands out yet. Notes appear as records build up.</p>}
    </section>
  );
}

export const STATUS_TAG: Record<string, string> = { running: "pill-green", opening: "pill-purple" };
