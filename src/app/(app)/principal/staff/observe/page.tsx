import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate, todayPK } from "@/lib/format";
import { StaffTabs } from "@/components/staff-tabs";
import { addObservation } from "@/app/(app)/principal/care/actions";

const SCORES = [["planning", "Planning"], ["delivery", "Teaching"], ["engagement", "Class involvement"], ["discipline", "Discipline"]] as const;

// Lesson observations: the principal scores a lesson and the teacher sees it.
export default async function Observe({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const sb = await createClient();
  const today = todayPK();
    const [{ data: teachers }, { data: secs }, { data: obs }] = await Promise.all([
      sb.from("profiles").select("id, full_name").eq("role", "teacher").eq("is_active", true).order("full_name"),
      sb.from("sections").select("id, name, classes(name, sort)"),
      sb.from("observations").select("*").order("observed_on", { ascending: false }).limit(60),
    ]);
    const tname = new Map((teachers ?? []).map((t) => [t.id, t.full_name]));
    const sname = new Map(((secs ?? []) as unknown as { id: string; name: string; classes: { name: string } }[]).map((s) => [s.id, `${s.classes.name} ${s.name}`]));
    const score = (o: Record<string, number | null>) => { const v = SCORES.map(([k]) => o[k]).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const body = (
      <div className="grid gap-5 xl:grid-cols-[400px_1fr] xl:items-start">
        <form action={addObservation} className="card">
          <h2 className="h2">Observe a lesson</h2>
          <label className="field">Teacher<select className="input" name="teacher_id" required>{(teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Class<select className="input" name="section_id"><option value="">—</option>{[...sname].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
            <label className="field">Date<input className="input" type="date" name="observed_on" defaultValue={today} /></label>
          </div>
          {SCORES.map(([k, l]) => <label key={k} className="field">{l} (1–5)<input className="input" type="number" min={1} max={5} name={k} defaultValue={3} /></label>)}
          <label className="field">Went well<input className="input" name="strengths" /></label>
          <label className="field">To improve<input className="input" name="improve" /></label>
          <button className="btn" type="submit">Save · teacher will see it</button>
        </form>
        <section className="card">
          <h2 className="h2">Observations</h2>
          {(obs ?? []).length === 0 && <p className="muted">None yet.</p>}
          {(obs ?? []).map((o) => { const s = score(o); return (
            <div key={o.id} className="row-box flex-wrap">
              <div className="min-w-40 flex-1"><div className="font-extrabold">{tname.get(o.teacher_id) ?? "Teacher"}</div><div className="muted text-xs">{shortDate(o.observed_on)}{o.section_id ? ` · ${sname.get(o.section_id) ?? ""}` : ""}{o.improve ? ` · improve: ${o.improve}` : ""}</div></div>
              <span className="text-lg font-black">{s == null ? "—" : `${s.toFixed(1)}/5`}</span>
            </div>); })}
        </section>
      </div>
    );
    return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Lesson observation</h1><p className="muted text-base">Sit in a lesson, score it, and the teacher sees what went well and what to improve.</p></div>
      </div>
      <StaffTabs current="observe" />
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {body}
    </>
  );
}
