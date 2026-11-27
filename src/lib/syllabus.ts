// Whole-year syllabus: chapters → one lesson per period, up to the date the book must finish.

export type Topic = { title: string; pages?: string };
export type Chapter = { n: number; title: string; pages?: string; weight?: number; topics: Topic[] };
export type PlannedLesson = { sort: number; chapter_n: number; chapter: string; topic: string; pages: string | null; homework: string | null; is_test: boolean; planned_on: string };

const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const weekday = (d: string) => ((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;   // 1 = Monday

// Which weekdays this subject is taught: from the timetable when there is one, else spread over Mon–Sat.
export function teachingDays(periodsPerWeek: number, fromTimetable: number[]): number[] {
  if (fromTimetable.length) return fromTimetable;           // may repeat a day for a double period
  const order = [1, 3, 5, 2, 4, 6];
  const n = Math.max(1, Math.min(14, periodsPerWeek));
  return Array.from({ length: n }, (_, i) => order[i % 6]);
}

// Every teaching period between two dates, skipping Sundays, holidays and exam days.
export function periodDates(start: string, end: string, days: number[], off: { starts_on: string; ends_on: string }[]) {
  const per = new Map<number, number>();
  for (const d of days) per.set(d, (per.get(d) ?? 0) + 1);
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 2000; d = addDays(d, 1)) {
    const w = weekday(d);
    if (w === 7 || !per.has(w) || off.some((h) => h.starts_on <= d && h.ends_on >= d)) continue;
    for (let i = 0; i < per.get(w)!; i++) out.push(d);
  }
  return out;
}

const pageCount = (p?: string) => {
  const m = p?.match(/(\d+)\s*[-–]\s*(\d+)/);
  return m ? Math.max(1, Number(m[2]) - Number(m[1]) + 1) : null;
};

// Lessons for the book: each topic gets periods in proportion to its pages (at least one), and every
// chapter ends with a short test. The lessons are laid evenly on the periods, keeping about the last
// tenth free for revision before the finish date.
export function planLessons(chapters: Chapter[], slots: string[]): PlannedLesson[] {
  type L = Omit<PlannedLesson, "sort" | "planned_on">;
  const raw: { ch: Chapter; t: Topic; pages: number | null }[] = chapters.flatMap((ch) =>
    (ch.topics.length ? ch.topics : [{ title: ch.title, pages: ch.pages }]).map((t) => ({ ch, t, pages: pageCount(t.pages) })));
  const tests = chapters.length;
  // about a tenth of the periods are kept free at the end for revision
  const room = Math.max(raw.length, Math.floor((slots.length - tests) * 0.9));
  const known = raw.filter((r) => r.pages).map((r) => r.pages!);
  const typical = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 4;
  const weight = raw.map((r) => r.pages ?? typical);
  const totalWeight = weight.reduce((s, w) => s + w, 0) || 1;
  // periods per topic in proportion to its pages, never below one
  const want = raw.map((_, i) => Math.max(1, Math.round((weight[i] / totalWeight) * room)));
  const lessons: L[] = [];
  raw.forEach((r, i) => {
    for (let k = 0; k < want[i]; k++) {
      lessons.push({
        chapter_n: r.ch.n, chapter: r.ch.title, topic: want[i] > 1 ? `${r.t.title} (${k + 1}/${want[i]})` : r.t.title,
        pages: r.t.pages ?? null, homework: k === want[i] - 1 ? "Exercise questions on this topic" : null, is_test: false,
      });
    }
    const last = i === raw.length - 1 || raw[i + 1].ch.n !== r.ch.n;
    if (last) lessons.push({ chapter_n: r.ch.n, chapter: r.ch.title, topic: `Chapter ${r.ch.n} test`, pages: null, homework: null, is_test: true });
  });
  // lay them evenly on the periods up to the revision weeks; with too few periods some days get two lessons
  const n = lessons.length;
  const span = Math.min(slots.length, Math.max(n, Math.floor(slots.length * 0.9)));
  return lessons.map((l, i) => ({
    ...l, sort: i + 1,
    planned_on: slots.length ? slots[Math.min(slots.length - 1, Math.floor((i * span) / n))] : addDays(new Date().toISOString().slice(0, 10), i),
  }));
}

// How far the class is: done vs. what the plan says should be done by today.
export function progressOf(lessons: { planned_on: string; done_on: string | null }[], today: string) {
  const total = lessons.length || 1;
  const done = lessons.filter((l) => l.done_on).length;
  const should = lessons.filter((l) => l.planned_on < today).length;
  const behind = Math.max(0, should - done);
  return { total: lessons.length, done, should, behind, doneR: done / total, shouldR: should / total, status: statusOf(done, should) };
}

export const statusOf = (done: number, should: number): "ok" | "behind" | "far" => { const b = should - done; return b >= 6 ? "far" : b >= 2 ? "behind" : "ok"; };
export const STATUS = { ok: ["On track", "g"], behind: ["Behind", "y"], far: ["Far behind", "r"] } as const;

// Share of the book planned by a date.
export const plannedBy = (lessons: { planned_on: string }[], d: string) => lessons.length ? lessons.filter((l) => l.planned_on <= d).length / lessons.length : 0;

// ---------- reading the contents page ----------

// Turns contents text into chapters. Works on typed lists and on the text of a book's contents page:
//   1 Force and motion ........ 12        or   Chapter 2: Matter (p 30-52)
//   1.1 Speed and velocity .... 14        or   2.3 Atoms (p 34-36)
export function parseContents(text: string): Chapter[] {
  const out: (Chapter & { start?: number })[] = [];
  const pageOf = (s: string) => {
    const r = s.match(/\(?\s*p(?:ages?|p)?\.?\s*(\d+)\s*[-–]\s*(\d+)\s*\)?\s*$/i);
    if (r) return { rest: s.slice(0, r.index).trim(), pages: `${r[1]}-${r[2]}`, start: Number(r[1]) };
    const n = s.match(/[\s.·…_]+(\d{1,3})\s*$/);
    if (n) return { rest: s.slice(0, n.index).trim(), pages: undefined, start: Number(n[1]) };
    return { rest: s.trim(), pages: undefined, start: undefined };
  };
  const tops: { ch: number; title: string; pages?: string; start?: number }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 3 || line.length > 140) continue;
    const t = line.match(/^(\d{1,2})\.(\d{1,2})\.?\s+(.+)$/);
    if (t) { const p = pageOf(t[3]); if (p.rest) tops.push({ ch: Number(t[1]), title: `${t[1]}.${t[2]} ${p.rest}`, pages: p.pages, start: p.start }); continue; }
    const c = line.match(/^(?:chapter|unit|ch\.?|lesson|باب)?\s*(\d{1,2})\s*[).:\-–]?\s+(.+)$/i);
    if (c && !/^\d/.test(c[2])) {
      const p = pageOf(c[2]);
      if (p.rest && !out.some((x) => x.n === Number(c[1]))) out.push({ n: Number(c[1]), title: p.rest.replace(/^[:\-–\s]+/, ""), pages: p.pages, start: p.start, topics: [] });
    }
  }
  out.sort((a, b) => a.n - b.n);
  // page ranges from where the next chapter starts
  out.forEach((ch, i) => {
    const next = out[i + 1]?.start;
    if (!ch.pages && ch.start && next && next > ch.start) ch.pages = `${ch.start}-${next - 1}`;
    const mine = tops.filter((t) => t.ch === ch.n);
    ch.topics = mine.map((t, k) => {
      const nx = mine[k + 1]?.start ?? next;
      return { title: t.title, pages: t.pages ?? (t.start && nx && nx > t.start ? `${t.start}-${nx - 1}` : t.start ? `${t.start}-${t.start + 1}` : undefined) };
    });
  });
  return out.map(({ n, title, pages, topics }) => ({ n, title, pages, topics }));
}

// The chapters back as editable text, in the shape parseContents reads.
export const contentsText = (chs: Chapter[]) => chs.map((c) =>
  [`${c.n} ${c.title}${c.pages ? ` (p ${c.pages})` : ""}`, ...c.topics.map((t, k) => `${/^\d+\.\d+/.test(t.title) ? "" : `${c.n}.${k + 1} `}${t.title}${t.pages ? ` (p ${t.pages})` : ""}`)].join("\n")).join("\n\n");

export const CHAPTERS_SCHEMA = {
  type: "object",
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "number" }, title: { type: "string" }, pages: { type: "string" },
          topics: { type: "array", items: { type: "object", properties: { title: { type: "string" }, pages: { type: "string" } }, required: ["title", "pages"], additionalProperties: false } },
        },
        required: ["n", "title", "pages", "topics"],
        additionalProperties: false,
      },
    },
  },
  required: ["chapters"],
  additionalProperties: false,
} as const;

// Cleans what the AI (or anyone) gave: numbered chapters, short titles, pages like "12-18" or none.
export function cleanChapters(xs: { n?: number; title?: string; pages?: string; topics?: { title?: string; pages?: string }[] }[]): Chapter[] {
  const pg = (p?: string) => { const m = String(p ?? "").match(/(\d+)\s*[-–]\s*(\d+)/); return m ? `${m[1]}-${m[2]}` : undefined; };
  return xs.filter((c) => String(c.title ?? "").trim()).slice(0, 40).map((c, i) => ({
    n: Number(c.n) > 0 ? Math.round(Number(c.n)) : i + 1,
    title: String(c.title).trim().slice(0, 120),
    pages: pg(c.pages),
    topics: (c.topics ?? []).filter((t) => String(t.title ?? "").trim()).slice(0, 30).map((t) => ({ title: String(t.title).trim().slice(0, 120), pages: pg(t.pages) })),
  }));
}
