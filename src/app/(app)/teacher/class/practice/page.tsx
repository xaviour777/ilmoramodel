import { moduleOn } from "@/lib/modules";
import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { Tabs } from "@/components/tabs";
import { Flash } from "@/components/flash";
import { addPracticeRule, toggleRule } from "@/app/(app)/passport/actions";
import { classExtraTabs } from "../extra-tabs";
import { classSections } from "../sections";

type Rule = { id: string; class_id: string | null; subject_id: string | null; below_percent: number; chapter: string | null; action: string; is_active: boolean; created_by: string | null; classes: { name: string } | null; subjects: { name: string } | null };

// Teachers' rules behind "What should I practise today?". Students see each one labelled as a teacher's rule.
export default async function PracticeRules({ searchParams }: { searchParams: Promise<{ section?: string; saved?: string; error?: string }> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const sections = await classSections(me);
  const sec = sections.find((s) => s.id === sp.section) ?? sections[0];
  if (!sec) return <><h1 className="h1">My class</h1><p className="muted">You don&apos;t teach any section yet.</p></>;
  const tabs = [["grades", "Gradebook"], ["analysis", "Test analysis"], ["remedial", "Remedial"], ["message", "Message parents"]]
    .map(([t, label]) => ({ id: t, label, href: `/teacher/class?section=${sec.id}&tab=${t}` })).concat(classExtraTabs(sec.id, await moduleOn("passport")));
  const supabase = await createClient();
  const back = `/teacher/class/practice?section=${sec.id}`;
  const [{ data: rules }, { data: subs }] = await Promise.all([
    supabase.from("practice_rules").select("id, class_id, subject_id, below_percent, chapter, action, is_active, created_by, classes(name), subjects(name)").order("created_at", { ascending: false }).limit(200),
    supabase.from("section_subjects").select("subject_id, subjects(name)").eq("section_id", sec.id),
  ]);
  const R = ((rules ?? []) as unknown as Rule[]).filter((r) => !r.class_id || r.class_id === sec.classId);
  const mine = (r: Rule) => me.role !== "teacher" || r.created_by === me.id;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">My class</h1><p className="muted text-base">Practice rules: what students see under &quot;What should I practise today?&quot;</p></div>
        <Tabs current="practice" tabs={tabs} />
      </div>
      <div className="flex flex-wrap gap-2">{sections.map((s) => <Link key={s.id} href={`/teacher/class/practice?section=${s.id}`} className="chip" style={s.id === sec.id ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)" } : undefined}>{s.label}</Link>)}</div>
      <Flash saved={sp.saved} error={sp.error} ur={false} />
      <section className="card">
        <h2 className="h2">New rule</h2>
        <p className="muted text-sm">If a student&apos;s last published result in the subject is below the mark, they see your suggestion with the reason. Without a rule, the app suggests a short practice test for subjects under 60%, labelled &quot;Automatic suggestion&quot;.</p>
        <form action={addPracticeRule} className="grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="back" value={back} />
          <select name="class_id" className="input" defaultValue={sec.classId}><option value={sec.classId}>Only {sec.label.split("-")[0]}</option><option value="">All classes</option></select>
          <select name="subject_id" className="input"><option value="">Any subject</option>{((subs ?? []) as unknown as { subject_id: string; subjects: { name: string } | null }[]).map((s) => <option key={s.subject_id} value={s.subject_id}>{s.subjects?.name}</option>)}</select>
          <label className="flex items-center gap-2 font-bold">Below <input name="below_percent" type="number" min={1} max={100} defaultValue={60} className="input w-24" /> %</label>
          <input name="chapter" maxLength={80} className="input" placeholder="Chapter (optional), e.g. Fractions" />
          <input name="action" required maxLength={300} className="input sm:col-span-2" placeholder="What to do, e.g. Do 10 MCQs from the question bank and redo exercise 3.2" />
          <button className="btn sm:col-span-2">Save rule</button>
        </form>
      </section>
      <section className="card">
        <h2 className="h2">Rules for {sec.label.split("-")[0]} ({R.length})</h2>
        {R.length === 0 && <p className="muted">No rules yet.</p>}
        {R.map((r) => (
          <div key={r.id} className="row-box" style={r.is_active ? undefined : { opacity: 0.55 }}>
            <div className="flex-1">
              <div className="font-extrabold">{r.subjects?.name ?? "Any subject"} below {r.below_percent}%: {r.action}{r.chapter ? ` (${r.chapter})` : ""}</div>
              <div className="muted text-xs">{r.classes?.name ?? "All classes"}{r.is_active ? "" : " · off"}</div>
            </div>
            {mine(r) && (
              <>
                <form action={toggleRule}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="on" value={r.is_active ? "0" : "1"} /><input type="hidden" name="back" value={back} /><button className="btn-ghost min-h-9 px-3 text-xs">{r.is_active ? "Turn off" : "Turn on"}</button></form>
                <form action={toggleRule}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="delete" value="1" /><input type="hidden" name="back" value={back} /><button className="muted text-xs underline">Delete</button></form>
              </>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
