import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pct, shortDate, todayPK } from "@/lib/format";
import { PracticeTest } from "./practice-test";

type Kid = { id: string; full_name: string; section_id: string | null; sections: { name: string; classes: { name: string } } | null };
const GR = [["A+", 0.8], ["A", 0.7], ["B", 0.6], ["C", 0.5], ["D", 0.4], ["E", 0.33], ["F", 0]] as const;
const grade = (r: number) => GR.find(([, m]) => r >= m)![0];
const nextGrade = (r: number) => { const i = GR.findIndex(([, m]) => r >= m); return i > 0 ? GR[i - 1] : null; };

// One child's growth: weak subjects, a target, today's plan, practice and badges. Only this child, never a ranking.
export async function StudentProgress({ kid }: { kid: Kid }) {
  const supabase = await createClient();
  const today = todayPK();
  const [{ data: marks }, { data: att }, { data: subs }, { data: practice }, { data: topics }, { data: stuck }] = await Promise.all([
    supabase.from("marks").select("obtained, is_absent, subjects(name), exams(name, total_marks, ends_on)").eq("student_id", kid.id).limit(500),
    supabase.from("attendance").select("date, status").eq("student_id", kid.id).order("date", { ascending: false }).limit(200),
    supabase.from("homework_submissions").select("submitted_at").eq("student_id", kid.id),
    supabase.from("practice_attempts").select("subject_id, chapter, total, correct, created_at, subjects(name)").eq("student_id", kid.id).order("created_at", { ascending: false }).limit(50),
    supabase.rpc("practice_topics", { p_student: kid.id }),
    supabase.from("tutor_sessions").select("subject_name, topic").eq("student_id", kid.id).eq("is_stuck", true).order("created_at", { ascending: false }).limit(10),
  ]);
  type M = { obtained: number | null; is_absent: boolean; subjects: { name: string }; exams: { name: string; total_marks: number; ends_on: string | null } };
  const by = new Map<string, number[]>();
  for (const m of (marks ?? []) as unknown as M[]) if (!m.is_absent && m.obtained != null) by.set(m.subjects.name, [...(by.get(m.subjects.name) ?? []), Number(m.obtained) / (m.exams.total_marks || 100)]);
  const subjects = [...by.entries()].map(([n, v]) => ({ n, r: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => a.r - b.r);
  const overall = subjects.length ? subjects.reduce((t, s) => t + s.r, 0) / subjects.length : null;
  const weak = subjects.filter((s) => s.r < 0.6).slice(0, 3);
  const target = overall != null ? nextGrade(overall) : null;
  // attendance over the last 30 marked days (no streaks: a missed day should never feel like losing everything)
  const recent = (att ?? []).slice(0, 30);
  const came = recent.filter((a) => a.status === "present" || a.status === "late").length;
  const hw = (subs ?? []).filter((s) => s.submitted_at).length;
  const pr = (practice ?? []) as unknown as { chapter: string | null; total: number; correct: number; created_at: string; subjects: { name: string } | null }[];
  const lowPractice = [...pr.reduce((m, p) => { const k = `${p.subjects?.name ?? ""} · ${p.chapter ?? "all"}`; const c = m.get(k) ?? { t: 0, c: 0 }; c.t += p.total; c.c += p.correct; return m.set(k, c); }, new Map<string, { t: number; c: number }>()).entries()]
    .filter(([, v]) => v.t >= 5 && v.c / v.t < 0.6).map(([k]) => k);
  const badges = [
    [recent.length >= 20 && came / recent.length >= 0.95, "Great attendance", `${came} of the last ${recent.length} school days`],
    [hw >= 10, "Homework hero", `${hw} homeworks handed in`], [pr.length >= 5, "Practice champ", `${pr.length} practice tests`],
    [overall != null && overall >= 0.8, "A+ student", `average ${overall != null ? pct(overall) : ""}`],
  ].filter(([ok]) => ok) as [boolean, string, string][];
  const plan = [
    ...weak.map((s) => `15 minutes of ${s.n}: it's your weakest subject at ${pct(s.r)}.`),
    ...lowPractice.slice(0, 2).map((k) => `Practise ${k} again: under 60% in your practice tests.`),
    ...((stuck ?? []).slice(0, 2).map((s) => `Ask your teacher about "${s.topic}" (${s.subject_name}): you got stuck on it with the tutor.`)),
  ];
  const first = kid.full_name.split(" ")[0];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <h2 className="h2">{first}&apos;s target</h2>
          {overall == null ? <p className="muted">No published results yet. The target and weak subjects show after the first results.</p> : (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <div className="text-center"><div className="text-4xl font-black">{grade(overall)}</div><div className="muted text-xs">now · {pct(overall)}</div></div>
                <div className="text-2xl font-black">→</div>
                <div className="text-center"><div className="text-4xl font-black" style={{ color: "var(--green)" }}>{target ? target[0] : "A+"}</div><div className="muted text-xs">target{target ? ` · ${Math.round(target[1] * 100)}%+` : " · keep it"}</div></div>
              </div>
              <h3 className="font-black">Subjects, weakest first</h3>
              {subjects.map((s) => (
                <div key={s.n} className="flex items-center gap-2"><span className="w-28 truncate text-sm font-bold">{s.n}</span><div className="track flex-1"><i style={{ width: `${s.r * 100}%`, background: s.r < 0.5 ? "var(--red)" : s.r < 0.6 ? "var(--orange)" : undefined }} /></div><span className="w-12 text-right text-sm font-black">{pct(s.r)}</span></div>
              ))}
            </>
          )}
        </section>
        <section className="card">
          <h2 className="h2">Today&apos;s plan · {shortDate(today)}</h2>
          {plan.length === 0 ? <p className="muted">Nothing extra today. Keep doing your homework on time.</p> : (
            <ol className="ml-5 list-decimal space-y-1.5 font-bold">{plan.slice(0, 5).map((p) => <li key={p}>{p}</li>)}</ol>
          )}
          <p className="muted text-xs"><span className="pill pill-gray">Automatic suggestion</span> Made from {first}&apos;s published marks, practice tests and homework-tutor questions.</p>
          <h3 className="font-black">Badges</h3>
          {badges.length === 0 ? <p className="muted">Come every day, hand in homework and practise to earn badges.</p> : (
            <div className="flex flex-wrap gap-2">{badges.map(([, b, w]) => <span key={b} className="pill pill-purple" title={w}>🏅 {b}</span>)}</div>
          )}
          <div className="text-sm font-bold">Came {came} of the last {recent.length} school days · {hw} homeworks handed in · {pr.length} practice tests</div>
        </section>
      </div>
      <section id="practice" className="card">
        <h2 className="h2">Practice test</h2>
        <PracticeTest studentId={kid.id} topics={(topics ?? []) as never} />
        {pr.length > 0 && <div className="mt-2 flex flex-col gap-1">{pr.slice(0, 5).map((p, i) => <div key={i} className="flex justify-between text-sm font-bold"><span>{p.subjects?.name} · {p.chapter ?? "all chapters"} · {shortDate(p.created_at.slice(0, 10))}</span><span>{p.correct}/{p.total}</span></div>)}</div>}
      </section>
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <h2 className="h2">Student ID card</h2>
          <p className="muted">With photo, student ID and a QR. Show it at the gate or keep it on the phone.</p>
          <Link href={`/print/id-card/${kid.id}`} target="_blank" className="btn self-start">Open ID card</Link>
        </section>
      </div>
    </div>
  );
}
