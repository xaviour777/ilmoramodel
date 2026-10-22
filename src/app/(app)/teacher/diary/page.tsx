import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { mySections } from "@/lib/teacher";
import { shortDate } from "@/lib/format";
import { addBehaviour, addDiary } from "../actions";

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const sections = await mySections(me.id);
  const label = new Map(sections.map((s) => [s.id, s.label]));
  const [{ data: subjects }, { data: diary }, { data: notes }, { data: students }] = await Promise.all([
    supabase.from("section_subjects").select("subject_id, subjects(name)").eq("teacher_id", me.id),
    supabase.from("lesson_diary").select("id, date, topic, notes, section_id, subjects(name)").eq("teacher_id", me.id).order("date", { ascending: false }).limit(10),
    supabase.from("behaviour_notes").select("id, kind, note, share_with_parents, created_at, students(full_name)").eq("teacher_id", me.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("students").select("id, full_name, section_id").in("section_id", sections.map((s) => s.id)).eq("status", "enrolled").order("full_name"),
  ]);
  const subjectOptions = [...new Map(((subjects ?? []) as unknown as { subject_id: string; subjects: { name: string } }[]).map((s) => [s.subject_id, s.subjects.name])).entries()];

  return (
    <>
      <div>
        <h1 className="h1">Lesson diary and student notes</h1>
        <p className="muted text-base">What you taught today, and praise or concerns about a student.</p>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      <div className="grid gap-5 xl:grid-cols-2">
        <form action={addDiary} className="card">
          <h2 className="h2">Today&apos;s lesson</h2>
          {sp.saved === "diary" && <div className="notice-ok">Diary saved. Parents can see it in the app.</div>}
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Class<select className="input" name="section_id" required>{sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label className="field">Subject<select className="input" name="subject_id">{subjectOptions.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
          </div>
          <label className="field">Topic<input className="input" name="topic" required placeholder="Chapter 5: factorisation" /></label>
          <label className="field">Notes<textarea className="input min-h-20 py-3" name="notes" placeholder="Covered exercise 5.2. 5.3 given as homework." /></label>
          <button className="btn" type="submit">Save diary</button>
          <h3 className="mt-2 font-black">Recent entries</h3>
          {(diary ?? []).map((d) => (
            <div key={d.id} className="row-box">
              <div className="flex-1">
                <div className="eyebrow">{shortDate(d.date)} · {label.get(d.section_id) ?? ""} · {(d.subjects as unknown as { name: string } | null)?.name}</div>
                <div className="font-extrabold">{d.topic}</div>
                {d.notes && <div className="muted text-xs">{d.notes}</div>}
              </div>
            </div>
          ))}
        </form>

        <form action={addBehaviour} className="card">
          <h2 className="h2">Note about a student</h2>
          {sp.saved === "note" && <div className="notice-ok">Note saved.</div>}
          <label className="field">Student
            <select className="input" name="student_id" required>
              {(students ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name} · {label.get(s.section_id)}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <label className="seg p"><input type="radio" name="kind" value="praise" defaultChecked /><span className="px-4">Praise</span></label>
            <label className="seg a"><input type="radio" name="kind" value="concern" /><span className="px-4">Concern</span></label>
          </div>
          <label className="field">Note<textarea className="input min-h-20 py-3" name="note" required placeholder="Helped classmates during the test review." /></label>
          <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="share" className="h-5 w-5" /> Share with parents</label>
          <button className="btn" type="submit">Save note</button>
          <h3 className="mt-2 font-black">Recent notes</h3>
          {(notes ?? []).map((n) => (
            <div key={n.id} className="row-box">
              <span className={`pill ${n.kind === "praise" ? "pill-green" : "pill-red"}`}>{n.kind}</span>
              <div className="flex-1">
                <div className="font-extrabold">{(n.students as unknown as { full_name: string } | null)?.full_name}</div>
                <div className="muted text-xs">{n.note}{n.share_with_parents ? " · shared with parents" : ""}</div>
              </div>
            </div>
          ))}
        </form>
      </div>
    </>
  );
}
