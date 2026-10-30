import { SettingsTabs } from "@/components/settings-tabs";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/format";
import { DEFAULT_BANDS } from "@/lib/report-card";
import { addSession, addTerm, deleteTerm, promoteStudents, saveGradingScale, setCurrentSession } from "./actions";

type Search = { saved?: string; error?: string };
type Band = { grade: string; min: number };

export default async function SchoolYearPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: sessions }, { data: terms }, { data: scales }, { data: sections }, { data: counts }] = await Promise.all([
    supabase.from("academic_sessions").select("id, name, starts_on, ends_on, is_current").order("starts_on", { ascending: false }),
    supabase.from("terms").select("id, session_id, name, starts_on, ends_on, sort").order("sort"),
    supabase.from("grading_scales").select("id, name, bands").order("name"),
    supabase.from("sections").select("id, name, classes(name, sort)"),
    supabase.from("students").select("section_id").eq("status", "enrolled").limit(20000),
  ]);
  const current = (sessions ?? []).find((s) => s.is_current) ?? null;
  const currentTerms = (terms ?? []).filter((t) => t.session_id === current?.id);
  type Sec = { id: string; name: string; classes: { name: string; sort: number } };
  const secs = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const size = new Map<string, number>();
  for (const s of counts ?? []) if (s.section_id) size.set(s.section_id, (size.get(s.section_id) ?? 0) + 1);
  const sorts = [...new Set(secs.map((s) => s.classes.sort))];
  // default move: same section letter in the next class up; the top class passes out
  const nextFor = (s: Sec) => {
    const up = sorts[sorts.indexOf(s.classes.sort) + 1];
    if (up === undefined) return "out";
    const inUp = secs.filter((x) => x.classes.sort === up);
    return (inUp.find((x) => x.name === s.name) ?? inUp[0])?.id ?? "";
  };
  const bandText = (b: Band[]) => b.map((x) => `${x.grade} ${x.min}`).join(", ");
  const promoted = sp.saved?.startsWith("promoted-") ? sp.saved.slice(9) : null;
  const y = new Date().getFullYear();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">School year</h1>
          <p className="muted text-base">The session and its terms, the grades on report cards, and moving every class up at the end of the year.</p>
        </div>
        <SettingsTabs current="year" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {promoted ? <div className="notice-ok">{promoted} students moved up.</div> : sp.saved && <div className="notice-ok">Saved.</div>}

      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="h2">Session</h2>
            {current && <span className="pill pill-green">{current.name} is current</span>}
          </div>
          {(sessions ?? []).map((s) => (
            <form key={s.id} action={setCurrentSession} className="row-box flex-wrap">
              <input type="hidden" name="session_id" value={s.id} />
              <div className="min-w-32 flex-1"><div className="font-extrabold">{s.name}</div><div className="muted text-xs">{shortDate(s.starts_on)} to {shortDate(s.ends_on)}</div></div>
              {s.is_current ? <span className="pill pill-green">Current</span> : <button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Make current</button>}
            </form>
          ))}
          <form action={addSession} className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              <label className="field">Name<input className="input" name="name" required placeholder={`${y}-${String(y + 1).slice(2)}`} /></label>
              <label className="field">Starts<input className="input" type="date" name="starts_on" required defaultValue={`${y}-04-01`} /></label>
              <label className="field">Ends<input className="input" type="date" name="ends_on" required defaultValue={`${y + 1}-03-31`} /></label>
            </div>
            <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="current" className="h-5 w-5" /> Make it the current year</label>
            <button className="btn-ghost self-start" type="submit">Add a session</button>
          </form>
          <p className="muted">Report cards and the Exams page use the current session.</p>
        </section>

        <section className="card">
          <h2 className="h2">Terms{current ? ` in ${current.name}` : ""}</h2>
          {!current && <p className="muted">Make a session current first.</p>}
          {currentTerms.length === 0 && current && <p className="muted">No terms yet. Exams are made inside a term.</p>}
          {currentTerms.map((t) => (
            <form key={t.id} action={deleteTerm} className="row-box">
              <input type="hidden" name="term_id" value={t.id} />
              <div className="flex-1"><div className="font-extrabold">{t.name}</div><div className="muted text-xs">{shortDate(t.starts_on)} to {shortDate(t.ends_on)}</div></div>
              <button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Remove</button>
            </form>
          ))}
          {current && (
            <form action={addTerm} className="flex flex-col gap-3">
              <input type="hidden" name="session_id" value={current.id} />
              <div className="grid grid-cols-3 gap-3">
                <label className="field">Name<input className="input" name="name" required placeholder="First term" /></label>
                <label className="field">Starts<input className="input" type="date" name="starts_on" required defaultValue={current.starts_on} /></label>
                <label className="field">Ends<input className="input" type="date" name="ends_on" required /></label>
              </div>
              <button className="btn-ghost self-start" type="submit">Add a term</button>
            </form>
          )}
        </section>

        <section className="card">
          <h2 className="h2">Grades on report cards</h2>
          <p className="muted">Each grade with the lowest percent that earns it. Anything below the last one is F.</p>
          {(scales ?? []).map((g) => (
            <form key={g.id} action={saveGradingScale} className="flex flex-col gap-2">
              <input type="hidden" name="scale_id" value={g.id} />
              <div className="grid grid-cols-[10rem_1fr] gap-3">
                <label className="field">Name<input className="input" name="name" defaultValue={g.name} /></label>
                <label className="field">Grades<input className="input" name="bands" defaultValue={bandText(g.bands as Band[])} /></label>
              </div>
              <button className="btn-ghost self-start" type="submit">Save</button>
            </form>
          ))}
          {(scales ?? []).length === 0 && (
            <form action={saveGradingScale} className="flex flex-col gap-2">
              <div className="grid grid-cols-[10rem_1fr] gap-3">
                <label className="field">Name<input className="input" name="name" defaultValue="Grades" /></label>
                <label className="field">Grades<input className="input" name="bands" defaultValue={bandText(DEFAULT_BANDS)} /></label>
              </div>
              <button className="btn-ghost self-start" type="submit">Save</button>
            </form>
          )}
        </section>

        <form action={promoteStudents} className="card">
          <h2 className="h2">Move classes up</h2>
          <p className="muted">Once final results are published, pick where each class goes. Students who pass out of the top class are marked as left; their fee record stays.</p>
          <div className="flex flex-col gap-2">
            {secs.filter((s) => size.get(s.id)).map((s) => (
              <label key={s.id} className="row-box">
                <span className="min-w-24 flex-1 font-extrabold">{s.classes.name}-{s.name} <span className="muted text-xs">· {size.get(s.id)}</span></span>
                <select className="input min-h-10 w-44 py-1 text-sm" name={`to:${s.id}`} defaultValue={nextFor(s)} aria-label={`Move ${s.classes.name}-${s.name} to`}>
                  <option value="">Stay</option>
                  {secs.map((x) => <option key={x.id} value={x.id}>{x.classes.name}-{x.name}</option>)}
                  <option value="out">Passed out</option>
                </select>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="sure" className="h-5 w-5" required /> Final results are done; move everyone now</label>
          <button className="btn self-start" type="submit">Move classes up</button>
          <p className="muted">Kept back students: change their class on their Students page afterwards. Make next year&apos;s session current after this.</p>
        </form>
      </div>
    </>
  );
}
