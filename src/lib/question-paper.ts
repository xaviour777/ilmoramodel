// Board-style papers made from the question bank: Section A MCQs, Section B short questions in
// groups ("attempt any 5 of 8"), Section C long questions ("attempt any 2 of 3").

export type Pattern = {
  mcq: { count: number; marks: number };
  short: { groups: number; perGroup: number; attempt: number; marks: number };
  long: { count: number; attempt: number; marks: number };
  minutes: number;
};

// Starting points only: each board changes its scheme from time to time, so the teacher can change every number.
export const PRESETS: { id: string; label: string; pattern: Pattern }[] = [
  { id: "board60", label: "Board style, 60 marks (Physics, Chemistry, Biology, Computer)", pattern: { mcq: { count: 12, marks: 1 }, short: { groups: 3, perGroup: 8, attempt: 5, marks: 2 }, long: { count: 3, attempt: 2, marks: 9 }, minutes: 135 } },
  { id: "board75", label: "Board style, 75 marks", pattern: { mcq: { count: 15, marks: 1 }, short: { groups: 3, perGroup: 9, attempt: 6, marks: 2 }, long: { count: 5, attempt: 3, marks: 8 }, minutes: 180 } },
  { id: "monthly", label: "Monthly test, 25 marks", pattern: { mcq: { count: 10, marks: 1 }, short: { groups: 1, perGroup: 6, attempt: 5, marks: 2 }, long: { count: 2, attempt: 1, marks: 5 }, minutes: 45 } },
  { id: "class", label: "Class test, 15 marks", pattern: { mcq: { count: 5, marks: 1 }, short: { groups: 1, perGroup: 4, attempt: 3, marks: 2 }, long: { count: 1, attempt: 1, marks: 4 }, minutes: 30 } },
];

export const totalMarks = (p: Pattern) => p.mcq.count * p.mcq.marks + p.short.groups * p.short.attempt * p.short.marks + p.long.attempt * p.long.marks;

export type BankQuestion = { id: string; chapter: string; kind: "mcq" | "short" | "long"; question: string; options: string[]; answer: string | null; source: string };

export type PaperItem = {
  section: "A" | "B" | "C";
  qno: number;              // the question number on the paper: 1 = all MCQs, then Q2, Q3...
  qid: string;
  kind: BankQuestion["kind"];
  chapter: string;
  question: string;
  options: string[];
  answer: string | null;
  marks: number;
};

const shuffle = <T,>(a: T[]) => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
};

// Takes n questions, going round the chapters so each chapter gets its share.
function spread(pool: BankQuestion[], n: number) {
  const by = new Map<string, BankQuestion[]>();
  for (const q of shuffle(pool)) by.set(q.chapter, [...(by.get(q.chapter) ?? []), q]);
  const lists = shuffle([...by.values()]);
  const out: BankQuestion[] = [];
  while (out.length < n && lists.some((l) => l.length)) for (const l of lists) if (l.length && out.length < n) out.push(l.shift()!);
  return out;
}

export const needs = (p: Pattern) => ({ mcq: p.mcq.count, short: p.short.groups * p.short.perGroup, long: p.long.count });

// Picks the questions; says what is short when the bank doesn't have enough.
export function makePaper(bank: BankQuestion[], p: Pattern): { items: PaperItem[] } | { short: string } {
  const need = needs(p);
  const of = (k: BankQuestion["kind"]) => bank.filter((q) => q.kind === k);
  const lack = (["mcq", "short", "long"] as const).filter((k) => of(k).length < need[k]);
  if (lack.length) {
    return { short: lack.map((k) => `${need[k]} ${k === "mcq" ? "MCQs" : `${k} questions`} needed, the bank has ${of(k).length}`).join("; ") };
  }
  const items: PaperItem[] = [];
  const add = (q: BankQuestion, section: PaperItem["section"], qno: number, marks: number) =>
    items.push({ section, qno, qid: q.id, kind: q.kind, chapter: q.chapter, question: q.question, options: q.options, answer: q.answer, marks });
  spread(of("mcq"), need.mcq).forEach((q) => add(q, "A", 1, p.mcq.marks));
  const shorts = spread(of("short"), need.short);
  for (let g = 0; g < p.short.groups; g++) shorts.slice(g * p.short.perGroup, (g + 1) * p.short.perGroup).forEach((q) => add(q, "B", 2 + g, p.short.marks));
  spread(of("long"), need.long).forEach((q, i) => add(q, "C", 2 + p.short.groups + i, p.long.marks));
  return { items };
}

// Another question of the same kind, not already on the paper.
export function replacement(bank: BankQuestion[], items: PaperItem[], at: number) {
  const used = new Set(items.map((i) => i.qid));
  const pool = bank.filter((q) => q.kind === items[at].kind && !used.has(q.id));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

export const isUrdu = (s: string) => /[؀-ۿ]/.test(s);
