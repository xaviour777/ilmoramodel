import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { mySections } from "@/lib/teacher";
import { shortDate, todayPK } from "@/lib/format";
import { saveLessonPlan } from "../class/actions";

const monday = (d: string) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
const addDays = (d: string, n: number) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// Weekly lesson plans, checked against what the diary says was actually taught.
export default async function Plans({ searchParams }: { searchParams: Promise<{ week?: string; saved?: string; error?: string }> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const week = monday(sp.week ?? todayPK());
  const end = addDays(week, 6);
  const sections = await mySections(me.id);
  const secIds = sections.map((s) => s.id);
  const [{ data: subs }, { data: plans }, { data: diary }] = await Promise.all([
    secIds.length ? supabase.from("section_subjects").select("section_id, subject_id, teacher_id, subjects(name)").in("section_id", secIds) : Promise.resolve({ data: [] }),
    supabase.from("lesson_plans").select("*").eq("week_start", week).eq("teacher_id", me.id),
    secIds.length ? supabase.from("lesson_diary").select("section_id, subject_id, date, topic").in("section_id", secIds).gte("date", week).lte("date", end) : Promise.resolve({ data: [] }),
  ]);
  type S = { section_id: string; subject_id: string; teacher_id: string | null; subjects: { name: string } };
  const pairs = ((subs ?? []) as unknown as S[]).filter((s) => s.teacher_id === me.id || me.role !== "teacher");
  const label = new Map(sections.map((s) => [s.id, s.label]));
  const back = `/teacher/plans?week=${week}`;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Lesson plans</h1><p className="muted text-base">Plan the week per class and subject. The diary shows what was really taught.</p></div>
        <div className="flex items-center gap-2">
          <Link className="btn-ghost min-h-10 px-3" href={`/teacher/plans?week=${addDays(week, -7)}`}>‹</Link>
          <span className="font-black">Week of {shortDate(week)}</span>
          <Link className="btn-ghost min-h-10 px-3" href={`/teacher/plans?week=${addDays(week, 7)}`}>›</Link>
        </div>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Plan saved.</div>}
      {pairs.length === 0 && <p className="muted">No subjects are assigned to you yet.</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        {pairs.map((s) => {
          const p = (plans ?? []).find((x) => x.section_id === s.section_id && x.subject_id === s.subject_id);
          const done = (diary ?? []).filter((d) => d.section_id === s.section_id && d.subject_id === s.subject_id);
          return (
            <form key={s.section_id + s.subject_id} action={saveLessonPlan} className="card">
              <input type="hidden" name="section_id" value={s.section_id} /><input type="hidden" name="subject_id" value={s.subject_id} />
              <input type="hidden" name="week_start" value={week} /><input type="hidden" name="back" value={back} />
              <div className="flex items-center justify-between"><h2 className="h2">{label.get(s.section_id)} · {s.subjects.name}</h2>
                <span className={`pill ${p ? (done.length ? "pill-green" : "pill-blue") : "pill-gray"}`}>{p ? (done.length ? `${done.length} lessons in diary` : "planned") : "no plan"}</span></div>
              <label className="field">Topics<textarea className="input min-h-20 py-2" name="topics" required defaultValue={p?.topics ?? ""} placeholder="Ch 4: fractions, adding and subtracting" /></label>
              <label className="field">Aims<input className="input" name="objectives" defaultValue={p?.objectives ?? ""} placeholder="Students can add unlike fractions" /></label>
              <label className="field">Homework<input className="input" name="homework" defaultValue={p?.homework ?? ""} placeholder="Ex 4.2 Q1-10" /></label>
              {done.length > 0 && <div className="text-sm"><b>Taught (diary):</b> {done.map((d) => `${shortDate(d.date)} ${d.topic}`).join(" · ")}</div>}
              <button className="btn-ghost self-start" type="submit">{p ? "Update plan" : "Save plan"}</button>
            </form>
          );
        })}
      </div>
    </>
  );
}
