import { pct, shortDate } from "@/lib/format";

export const GOAL = 0.9;

// Line chart of the daily attendance rate, with the 90% goal as a dashed line.
export function AttendanceChart({ series, today }: { series: { date: string; rate: number }[]; today: string }) {
  if (series.length === 0) return <p className="py-10 text-center text-body-sm text-on-surface-variant">No attendance marked in the last 30 days.</p>;
  const W = 760, H = 180, L = 36, R = 12, T = 12, B = 160;
  const lo = Math.max(0, Math.floor((Math.min(GOAL, ...series.map((d) => d.rate)) - 0.03) * 20) / 20);
  const y = (r: number) => B - ((r - lo) / (1 - lo)) * (B - T);
  const x = (i: number) => (series.length === 1 ? (L + W - R) / 2 : L + (i / (series.length - 1)) * (W - R - L));
  const line = "M " + series.map((d, i) => `${x(i).toFixed(1)} ${y(d.rate).toFixed(1)}`).join(" L ");
  const area = `${line} L ${x(series.length - 1).toFixed(1)} ${B} L ${x(0).toFixed(1)} ${B} Z`;
  const ticks = [1, (1 + lo) / 2, lo];
  const last = series.at(-1)!;
  const n = series.length - 1;
  const labelIdx = [...new Set([0, Math.round(n / 4), Math.round(n / 2), Math.round((n * 3) / 4), n])];
  const dm = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  return (
    <>
      <div className="relative h-56 w-full pt-2">
        <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Daily attendance for the last 30 days, latest ${pct(last.rate, 1)}`}>
          <defs><linearGradient id="attGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#103D37" stopOpacity="0.18" /><stop offset="100%" stopColor="#103D37" stopOpacity="0" /></linearGradient></defs>
          {ticks.map((t) => <line key={t} x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="#E6ECE8" strokeDasharray="3 3" />)}
          <line x1={L} x2={W} y1={B} y2={B} stroke="#E6ECE8" />
          <line x1={L} x2={W} y1={y(GOAL)} y2={y(GOAL)} stroke="#ba1a1a" strokeDasharray="5 4" strokeWidth="1.5" opacity="0.7" />
          <path d={area} fill="url(#attGradient)" />
          <path d={line} fill="none" stroke="#103D37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {series.map((d, i) => d.rate < GOAL && <circle key={d.date} cx={x(i)} cy={y(d.rate)} r="3" fill="#ba1a1a"><title>{`${shortDate(d.date)}: ${pct(d.rate, 1)}`}</title></circle>)}
          <circle cx={x(n)} cy={y(last.rate)} r="5" fill="#006d3b" />
          <circle cx={x(n)} cy={y(last.rate)} r="9" fill="none" stroke="#006d3b" strokeWidth="1.5" opacity="0.5" />
        </svg>
        {/* y labels outside the stretched svg so the text keeps its shape */}
        {ticks.map((t) => <span key={t} className="absolute left-0 -translate-y-1/2 text-[10px] text-outline" style={{ top: `calc(0.5rem + (100% - 0.5rem) * ${(y(t) / H).toFixed(3)})` }}>{pct(t)}</span>)}
      </div>
      <div className="flex items-center justify-between gap-2 px-2 pt-2 text-[11px] font-semibold text-outline">
        {labelIdx.map((i, k) => (
          <span key={series[i].date} className={i === n ? "font-bold text-primary" : k % 2 ? "hidden sm:inline" : ""}>
            {i === n ? `${series[i].date === today ? "Today" : dm(series[i].date)} · ${pct(series[i].rate, 1)}` : dm(series[i].date)}
          </span>
        ))}
      </div>
    </>
  );
}
