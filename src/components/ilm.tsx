import Link from "next/link";

// Building blocks for the principal pages (design/ilmora.css).

export function PageHead({ kick, title, sub, children }: { kick: React.ReactNode; title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="kick">{kick}</div>
        <h1 className="h1 mt-1">{title}</h1>
        {sub && <p className="muted mt-1.5 text-[15px]">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  );
}

export function Stats({ children, min = 170 }: { children: React.ReactNode; min?: number }) {
  return <section className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>{children}</section>;
}

export function Stat({ label, value, sub, tone, warn, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string; warn?: boolean; href?: string }) {
  const body = (
    <>
      <div className="kick">{label}</div>
      <div className="mt-1.5 text-[28px] leading-9 font-black tabular-nums" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="muted text-[13px]">{sub}</div>}
    </>
  );
  const style = warn ? { borderColor: "#f59e0b", boxShadow: "0 4px 0 #fcd34d", background: "#fffbeb" } : undefined;
  return href ? <Link href={href} className="card block" style={style}>{body}</Link> : <div className="card" style={style}>{body}</div>;
}

// Link chips that work as filters or period pickers (Today / Week / Month ...).
export function Chips({ items, current, label }: { items: { id: string; label: string; href: string }[]; current: string; label?: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {items.map((i) => (
        <Link key={i.id} href={i.href} aria-current={i.id === current ? "true" : undefined} scroll={false}
          className={`inline-flex min-h-10 items-center rounded-xl border-2 px-4 text-[14px] font-extrabold whitespace-nowrap ${i.id === current
            ? "border-[#7dd3fc] bg-[#e0f2fe] text-[#0369a1] shadow-[0_3px_0_#7dd3fc]" : "border-[#e5e7eb] bg-white text-[#4b5563] shadow-[0_3px_0_#e5e7eb]"}`}>
          {i.label}
        </Link>
      ))}
    </div>
  );
}

// Dark "insight" card. Text is worked out from the page's own numbers, so it says so.
export function Insight({ title = "Insight", children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] bg-[#1f2937] p-3.5 text-[14px] leading-[22px] font-bold text-white shadow-[0_4px_0_#111827]">
      <span className="text-[12px] font-black tracking-[.1em] text-[#fcd34d] uppercase">{title} · from your data</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[14px] border-2 border-dashed border-[#e5e7eb] px-4 py-6 text-center text-[14px] font-bold text-[#6b7280]">{children}</p>;
}

export function Bar({ value, color = "#16a34a" }: { value: number; color?: string }) {
  return <div className="h-3 overflow-hidden rounded-full bg-[#eef2f7]"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} /></div>;
}

export function Row({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2.5 ${className}`}>{children}</div>;
}

// Simple vertical bars, CSS only.
export function Bars({ bars, height = 180, unit = "" }: { bars: { label: string; value: number; color?: string; note?: string }[]; height?: number; unit?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div>
      <div className="flex items-end gap-2 border-b-2 border-[#e5e7eb] sm:gap-3.5" style={{ height }} role="img" aria-label={bars.map((b) => `${b.label} ${b.note ?? b.value + unit}`).join(", ")}>
        {bars.map((b) => (
          <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11px] font-black whitespace-nowrap text-[#4b5563]">{b.note ?? `${b.value}${unit}`}</span>
            <div className="w-full max-w-[60px] rounded-t-[10px] rounded-b-[4px]" style={{ height: `${(b.value / max) * 82}%`, minHeight: b.value ? 4 : 0, background: b.color ?? "#16a34a" }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 sm:gap-3.5">{bars.map((b) => <span key={b.label} className="flex-1 truncate text-center text-[12px] font-extrabold text-[#6b7280]">{b.label}</span>)}</div>
    </div>
  );
}
