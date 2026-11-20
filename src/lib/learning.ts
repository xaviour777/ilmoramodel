import { cookies } from "next/headers";
import type { createClient } from "@/lib/supabase/server";
import { todayPK } from "@/lib/format";

type DB = Awaited<ReturnType<typeof createClient>>;

// Urdu first for parents, English first for students; the اردو / English button (cookie "lang") wins.
export async function familyUrdu(role: string): Promise<boolean> {
  const c = (await cookies()).get("lang")?.value;
  if (c === "ur") return true;
  if (c === "en") return false;
  return role === "parent";
}

// Pick the English or Urdu text.
export const say = (ur: boolean) => (en: string, urdu: string) => (ur ? urdu : en);

export type Kid = { id: string; full_name: string; section_id: string | null; sections: { name: string; class_id?: string; classes: { name: string } } | null };
export const KID_SELECT = "id, full_name, section_id, sections(name, class_id, classes(name))";

export type MarkRow = {
  subject_id: string; obtained: number | null; is_absent: boolean; subjects: { name: string } | null;
  exams: { id?: string; name: string; total_marks: number; starts_on: string | null; ends_on: string | null } | null;
};

export type SubjectTrend = { id: string; name: string; latest: number; previous: number | null; avg: number; exams: number };
export type ExamStep = { name: string; when: string | null; r: number };

// Per subject: the latest published result, the one before it and the average. Oldest exams first.
export function subjectTrends(marks: MarkRow[]): { subjects: SubjectTrend[]; steps: ExamStep[] } {
  const rows = marks.filter((m) => m.exams && m.subjects && !m.is_absent && m.obtained != null)
    .map((m) => ({ sid: m.subject_id, sname: m.subjects!.name, exam: m.exams!.name, when: m.exams!.ends_on ?? m.exams!.starts_on, r: Number(m.obtained) / (m.exams!.total_marks || 100) }))
    .sort((a, b) => (a.when ?? "").localeCompare(b.when ?? ""));
  const bySub = new Map<string, { name: string; rs: number[] }>();
  for (const r of rows) { const s = bySub.get(r.sid) ?? { name: r.sname, rs: [] }; s.rs.push(r.r); bySub.set(r.sid, s); }
  const subjects = [...bySub.entries()].map(([id, s]) => ({
    id, name: s.name, latest: s.rs[s.rs.length - 1], previous: s.rs.length > 1 ? s.rs[s.rs.length - 2] : null,
    avg: s.rs.reduce((a, b) => a + b, 0) / s.rs.length, exams: s.rs.length,
  })).sort((a, b) => a.latest - b.latest);
  const byExam = new Map<string, { when: string | null; rs: number[] }>();
  for (const r of rows) { const e = byExam.get(r.exam) ?? { when: r.when, rs: [] }; e.rs.push(r.r); byExam.set(r.exam, e); }
  const steps = [...byExam.entries()].map(([name, e]) => ({ name, when: e.when, r: e.rs.reduce((a, b) => a + b, 0) / e.rs.length }))
    .sort((a, b) => (a.when ?? "").localeCompare(b.when ?? ""));
  return { subjects, steps };
}

const P = (x: number) => `${Math.round(x * 100)}%`;

// Plain words for a result, no jargon.
export function band(r: number, ur: boolean) {
  const t = say(ur);
  if (r >= 0.8) return { word: t("Excellent", "بہت عمدہ"), tone: "green" as const };
  if (r >= 0.6) return { word: t("Good", "اچھا"), tone: "blue" as const };
  if (r >= 0.4) return { word: t("Needs some practice", "تھوڑی مشق چاہیے"), tone: "orange" as const };
  return { word: t("Needs help", "مدد چاہیے"), tone: "red" as const };
}

// "Maths went up from 62% to 71%." Changes under 5 points count as steady.
export function trendSentence(s: SubjectTrend, ur: boolean): { text: string; dir: "up" | "down" | "same" | "new" } {
  if (s.previous == null) return { dir: "new", text: ur ? `${s.name}: پہلا نتیجہ ${P(s.latest)}` : `${s.name}: first result ${P(s.latest)}` };
  const d = s.latest - s.previous;
  if (d >= 0.05) return { dir: "up", text: ur ? `${s.name}: ${P(s.previous)} سے بڑھ کر ${P(s.latest)} ہو گیا` : `${s.name} went up from ${P(s.previous)} to ${P(s.latest)}` };
  if (d <= -0.05) return { dir: "down", text: ur ? `${s.name}: ${P(s.previous)} سے کم ہو کر ${P(s.latest)} ہو گیا` : `${s.name} went down from ${P(s.previous)} to ${P(s.latest)}` };
  return { dir: "same", text: ur ? `${s.name}: ${P(s.latest)} پر قائم` : `${s.name} stayed about the same at ${P(s.latest)}` };
}

export type Suggestion = { text: string; why: string; source: "teacher" | "auto"; href?: string };
export type Rule = { id: string; class_id: string | null; subject_id: string | null; below_percent: number; chapter: string | null; action: string; is_active: boolean };

// "What should I practise today?": teacher rules first, then simple automatic ones, from real marks,
// practice tests, homework and tutor questions. At most four, every one says why.
export async function practiceToday(supabase: DB, kid: Kid, subjects: SubjectTrend[], ur: boolean, practiceHref: string): Promise<Suggestion[]> {
  const t = say(ur);
  const today = todayPK();
  const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  const classId = kid.sections?.class_id ?? null;
  const [{ data: rules }, { data: practice }, { data: stuck }, { data: hw }] = await Promise.all([
    supabase.from("practice_rules").select("id, class_id, subject_id, below_percent, chapter, action, is_active").eq("is_active", true).limit(200),
    supabase.from("practice_attempts").select("total, correct, chapter, subjects(name)").eq("student_id", kid.id).order("created_at", { ascending: false }).limit(40),
    supabase.from("tutor_sessions").select("subject_name, topic").eq("student_id", kid.id).eq("is_stuck", true).order("created_at", { ascending: false }).limit(3),
    kid.section_id ? supabase.from("homework").select("id, title, due_on, subjects(name)").eq("section_id", kid.section_id).gte("due_on", today).lte("due_on", tomorrow).limit(6) : Promise.resolve({ data: [] }),
  ]);
  const out: Suggestion[] = [];
  // homework due today or tomorrow that hasn't been handed in
  const hwRows = (hw ?? []) as unknown as { id: string; title: string; due_on: string; subjects: { name: string } | null }[];
  if (hwRows.length) {
    const { data: subs } = await supabase.from("homework_submissions").select("homework_id, submitted_at").eq("student_id", kid.id).in("homework_id", hwRows.map((h) => h.id));
    const done = new Set((subs ?? []).filter((s) => s.submitted_at).map((s) => s.homework_id));
    for (const h of hwRows.filter((h) => !done.has(h.id)).slice(0, 1))
      out.push({ source: "auto", text: t(`Finish your ${h.subjects?.name ?? ""} homework: ${h.title}`, `${h.subjects?.name ?? ""} کا ہوم ورک مکمل کریں: ${h.title}`), why: t(h.due_on === today ? "It is due today." : "It is due tomorrow.", h.due_on === today ? "آج جمع ہونا ہے۔" : "کل جمع ہونا ہے۔") });
  }
  const matched = new Set<string>();
  for (const s of subjects) {
    const rs = ((rules ?? []) as Rule[]).filter((r) => (!r.class_id || r.class_id === classId) && (!r.subject_id || r.subject_id === s.id) && s.latest * 100 < r.below_percent)
      .sort((a, b) => Number(!!b.subject_id) - Number(!!a.subject_id) || Number(!!b.class_id) - Number(!!a.class_id));
    const r = rs[0];
    if (!r) continue;
    matched.add(s.id);
    out.push({ source: "teacher", href: practiceHref, text: `${s.name}: ${r.action}${r.chapter ? ` (${r.chapter})` : ""}`,
      why: t(`Your last ${s.name} result was ${P(s.latest)}, under the teacher's ${r.below_percent}% mark.`, `${s.name} کا پچھلا نتیجہ ${P(s.latest)} تھا، جو استاد کی ${r.below_percent}% حد سے کم ہے۔`) });
  }
  for (const s of subjects.filter((s) => !matched.has(s.id) && s.latest < 0.6).slice(0, 2))
    out.push({ source: "auto", href: practiceHref, text: t(`15 minutes of ${s.name}: one short practice test`, `${s.name} کے 15 منٹ: ایک چھوٹا مشقی ٹیسٹ`),
      why: t(`Your last ${s.name} result was ${P(s.latest)}.`, `${s.name} کا پچھلا نتیجہ ${P(s.latest)} تھا۔`) });
  const pr = (practice ?? []) as unknown as { total: number; correct: number; chapter: string | null; subjects: { name: string } | null }[];
  const agg = new Map<string, { t: number; c: number }>();
  for (const p of pr) { const k = `${p.subjects?.name ?? ""} · ${p.chapter ?? t("all chapters", "تمام ابواب")}`; const a = agg.get(k) ?? { t: 0, c: 0 }; a.t += p.total; a.c += p.correct; agg.set(k, a); }
  for (const [k, v] of [...agg.entries()].filter(([, v]) => v.t >= 5 && v.c / v.t < 0.6).slice(0, 1))
    out.push({ source: "auto", href: practiceHref, text: t(`Practise ${k} again`, `${k} کی دوبارہ مشق کریں`), why: t(`${v.c} of ${v.t} right in practice tests so far.`, `مشقی ٹیسٹوں میں اب تک ${v.t} میں سے ${v.c} درست۔`) });
  for (const s of ((stuck ?? []) as { subject_name: string | null; topic: string | null }[]).slice(0, 1))
    if (s.topic) out.push({ source: "auto", text: t(`Ask your teacher about "${s.topic}"`, `"${s.topic}" کے بارے میں استاد سے پوچھیں`), why: t(`You got stuck on it with the homework tutor${s.subject_name ? ` (${s.subject_name})` : ""}.`, `ہوم ورک ٹیوٹر کے ساتھ یہاں مشکل آئی تھی۔`) });
  return out.slice(0, 4);
}

export const KIND_LABEL: Record<string, [string, string]> = {
  milestone: ["Learning milestone", "سیکھنے کا سنگ میل"], project: ["Project", "پروجیکٹ"], achievement: ["School achievement", "اسکول کی کامیابی"],
  certificate: ["Certificate", "سرٹیفکیٹ"], skill: ["Skill", "مہارت"], creative: ["Creative work", "تخلیقی کام"], reflection: ["Reflection", "اپنی سوچ"],
};
export const KIND_ICON: Record<string, string> = { milestone: "🚩", project: "🛠️", achievement: "🏆", certificate: "📜", skill: "🌱", creative: "🎨", reflection: "💭" };
