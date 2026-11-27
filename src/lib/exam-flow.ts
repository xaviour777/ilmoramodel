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

// Rough minutes for each exam job, done by hand vs. in Prinqo. Shown as an estimate, with the
// assumptions next to it, so a principal can see where the time goes.
export const TIME_MODEL = [
  { id: "sheet", job: "Date sheet", unit: "once", byHand: 90, ilmora: 2, how: "typed, checked for clashes and holidays, photocopied" },
  { id: "papers", job: "Question papers", unit: "paper", byHand: 120, ilmora: 15, how: "set, typed and proofread per subject per class; AI draft + teacher check" },
  { id: "print", job: "Admit cards and roll slips", unit: "student", byHand: 1, ilmora: 0.05, how: "written or typed one by one" },
  { id: "check", job: "MCQ checking", unit: "answer sheet", byHand: 1.5, ilmora: 0.2, how: "ticked by hand vs. phone scan" },
  { id: "marks", job: "Marks register and totals", unit: "answer sheet", byHand: 1, ilmora: 0.3, how: "award list → register → calculator" },
  { id: "result", job: "Result cards and positions", unit: "student", byHand: 5, ilmora: 0.2, how: "totals, %, grade, position, card written" },
  { id: "parents", job: "Telling parents", unit: "family", byHand: 3, ilmora: 0, how: "calls, diary notes, PTM queue" },
] as const;

export function timeSaved(n: { papers: number; students: number; sheets: number; families: number }) {
  const qty = { sheet: 1, papers: n.papers, print: n.students, check: n.sheets, marks: n.sheets, result: n.students, parents: n.families };
  const rows = TIME_MODEL.map((t) => ({ ...t, qty: qty[t.id], hand: t.byHand * qty[t.id], app: t.ilmora * qty[t.id] }));
  const hand = rows.reduce((s, r) => s + r.hand, 0);
  const app = rows.reduce((s, r) => s + r.app, 0);
  return { rows, hand, app, saved: hand - app };
}

export const hours = (min: number) => (min < 60 ? `${Math.round(min)} min` : `${(min / 60).toFixed(min < 600 ? 1 : 0)} hrs`);
