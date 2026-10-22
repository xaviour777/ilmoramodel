import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { mySections } from "@/lib/teacher";
import { shortDate, todayPK } from "@/lib/format";
import { createHomework } from "../actions";

export default async function HomeworkPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const sections = await mySections(me.id);
  const label = new Map(sections.map((s) => [s.id, s.label]));
  const [{ data: subjects }, { data: tasks }] = await Promise.all([
    supabase.from("section_subjects").select("subject_id, subjects(name)").eq("teacher_id", me.id),
    supabase.from("homework_progress").select("*").eq("teacher_id", me.id).order("due_on", { ascending: false }).limit(30),
  ]);
  const subjectOptions = [...new Map(((subjects ?? []) as unknown as { subject_id: string; subjects: { name: string } }[])
    .map((s) => [s.subject_id, s.subjects.name])).entries()];

  return (
    <>
      <div>
        <h1 className="h1">Homework tasks</h1>
        <p className="muted text-base">Give a task once. Students see it in their app and parents get one message per family.</p>
      </div>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <form action={createHomework} className="card xl:w-[400px]">
          <h2 className="h2">New task</h2>
          {sp.saved && <div className="notice-ok">Assigned. It&apos;s now at the top of the list.</div>}
          {sp.error && <div className="notice-bad">{sp.error}</div>}
          <label className="field">Class
            <select className="input" name="section_id" required>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="field">Subject
            <select className="input" name="subject_id">
              {subjectOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="field">Title<input className="input" name="title" required placeholder="Exercise 5.3, questions 1 to 10" /></label>
          <label className="field">Instructions<textarea className="input min-h-24 py-3" name="instructions" placeholder="Solve in your copy. Show every step." /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Due date<input className="input" type="date" name="due_on" required min={todayPK()} /></label>
            <label className="field">Marks<input className="input" type="number" name="total_marks" min={0} placeholder="10" /></label>
          </div>
          <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="notify_parents" defaultChecked className="h-5 w-5" /> Tell parents on WhatsApp</label>
          <button className="btn" type="submit">Assign</button>
        </form>

        <section className="card flex-1">
          <h2 className="h2">Given recently</h2>
          {(tasks ?? []).length === 0 && <p className="muted">No homework yet.</p>}
          {(tasks ?? []).map((t) => {
            const r = t.students ? t.submitted / t.students : 0;
            const allChecked = t.submitted > 0 && t.checked >= t.submitted;
            const badge = t.submitted === 0 ? ["New", "pill-blue"] : allChecked ? ["All checked", "pill-green"] : r < 0.5 ? ["Few in", "pill-orange"] : ["To check", "pill-purple"];
            return (
              <div key={t.homework_id} className="flex flex-col gap-2.5 rounded-2xl border-2 p-3.5" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="eyebrow">{label.get(t.section_id) ?? ""} · due {shortDate(t.due_on)}</div>
                    <div className="text-lg font-black">{t.title}</div>
                  </div>
                  <span className={`pill ${badge[1]}`}>{badge[0]}</span>
                </div>
                <div className="track"><i style={{ width: `${Math.round(r * 100)}%`, background: r < 0.5 ? "var(--orange)" : undefined }} /></div>
                <div className="muted">{t.submitted} of {t.students} submitted · {t.checked} checked</div>
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}
