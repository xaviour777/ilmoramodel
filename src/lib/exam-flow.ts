// Small helpers for the exam flow: school days for the date sheet, positions and toppers.

const addDays = (d: string, n: number) => {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
// 1 = Monday ... 7 = Sunday
export const weekday = (d: string) => ((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;

// The next `count` school days from `start` (start included): no Sundays (and no Saturdays when
// asked), no holidays or vacations, and `gap` free days between papers.
export function schoolDays(start: string, count: number, holidays: { starts_on: string; ends_on: string }[], opts: { saturday?: boolean; gap?: number } = {}) {
  const off = (d: string) => weekday(d) === 7 || (!opts.saturday && weekday(d) === 6) || holidays.some((h) => h.starts_on <= d && h.ends_on >= d);
  const out: string[] = [];
  let d = start;
  for (let guard = 0; out.length < count && guard < 400; guard++, d = addDays(d, 1)) {
    if (off(d)) continue;
    out.push(d);
    for (let g = 0; g < (opts.gap ?? 0); g++) { d = addDays(d, 1); while (off(d)) d = addDays(d, 1); }
  }
  return out;
}

// Positions by total, ties share a place (1, 2, 2, 4).
export function positions<T extends { total: number }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  return sorted.map((r, i) => ({ ...r, pos: i > 0 && sorted[i - 1].total === r.total ? 0 : i + 1 }))
    .map((r, i, a) => ({ ...r, pos: r.pos || a.slice(0, i).reverse().find((x) => x.pos)!.pos }));
}

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
export const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
