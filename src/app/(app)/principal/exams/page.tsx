import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate, time, todayPK } from "@/lib/format";
import { addPaper, addStandardClasses, createExam, setExamStatus } from "../actions";

type Search = { term?: string; exam?: string; saved?: string; error?: string };
const KIND: Record<string, string> = { class_test: "Class test", monthly: "Monthly test", term: "Term exam", sendup: "Send-up", final: "Final", other: "Other" };
// Ideas for the name box; the principal can type any name instead.
const NAME_IDEAS = ["Weekly test", "Monthly test · November", "December test", "Mid-term exam", "Pre-board test", "Send-up exam", "Final exam", "Surprise quiz", "Chapter 3 test", "Summer homework test"];
const STATUS: Record<string, [string, string, string]> = {
  draft: ["Draft", "pill-gray", "var(--line)"],
  date_sheet: ["Date sheet out", "pill-blue", "var(--blue)"],
  marks_entry: ["Marks entry", "pill-orange", "var(--orange)"],
  results: ["Results out", "pill-green", "var(--green)"],
};
const NEXT: Record<string, [string, string] | undefined> = {
  draft: ["date_sheet", "Publish date sheet"],
  date_sheet: ["marks_entry", "Open marks entry"],
  marks_entry: ["results", "Publish results and lock marks"],
};

export default async function ExamsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const [{ data: terms }, { data: classes }, { data: subjects }, { data: scales }, { data: staff }] = await Promise.all([
    supabase.from("terms").select("id, name, starts_on, ends_on, academic_sessions!inner(is_current)").eq("academic_sessions.is_current", true).order("sort"),
    supabase.from("classes").select("id, name").order("sort"),
    supabase.from("subjects").select("id, name").order("name"),
    supabase.from("grading_scales").select("id, name"),
    supabase.from("profiles").select("id, full_name").in("role", ["teacher", "principal"]).order("full_name"),
  ]);
  const term = (terms ?? []).find((t) => t.id === sp.term)
    ?? (terms ?? []).find((t) => t.starts_on <= today && t.ends_on >= today) ?? (terms ?? [])[0];
  const { data: exams } = term
    ? await supabase.from("exams").select("id, name, kind, starts_on, ends_on, total_marks, weight_percent, status, exam_sections(section_id)").eq("term_id", term.id).order("starts_on")
    : { data: [] };
  const exam = (exams ?? []).find((e) => e.id === sp.exam) ?? (exams ?? [])[0];

  // how far teachers are with marks: entered marks vs students × subjects in the exam's sections
  const progress = new Map<string, number>();
  for (const e of exams ?? []) {
    const secIds = e.exam_sections.map((s: { section_id: string }) => s.section_id);
    const [{ count: studs }, { count: entered }] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }).in("section_id", secIds.length ? secIds : ["00000000-0000-0000-0000-000000000000"]).eq("status", "enrolled"),
      supabase.from("marks").select("id", { count: "exact", head: true }).eq("exam_id", e.id),
    ]);
    const expected = (studs ?? 0) * (subjects?.length ?? 1);
    progress.set(e.id, expected ? Math.min(1, (entered ?? 0) / expected) : 0);
  }
  const { data: papers } = exam
    ? await supabase.from("exam_papers").select("id, paper_date, starts_at, ends_at, classes(name, sort), subjects(name), profiles(full_name)").eq("exam_id", exam.id).order("paper_date")
    : { data: [] };
  type Paper = { id: string; paper_date: string; starts_at: string | null; ends_at: string | null; classes: { name: string; sort: number }; subjects: { name: string }; profiles: { full_name: string } | null };

  return (
    <>
      <div>
        <h1 className="h1">Terms and exams</h1>
        <p className="muted text-base">Make tests and exams, publish the date sheet, open marks entry for teachers, then publish results.</p>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      <div className="flex flex-wrap gap-2.5">
        {(terms ?? []).map((t) => {
          const tag = t.ends_on < today ? ["Done", "var(--green-ink)"] : t.starts_on <= today ? ["Now", "var(--blue-ink)"] : ["Later", "var(--muted)"];
          return (
            <Link key={t.id} href={`/principal/exams?term=${t.id}`} className="flex min-h-20 min-w-40 flex-1 flex-col gap-1 rounded-2xl border-2 bg-white px-3.5 py-3"
              style={t.id === term?.id ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)" } : { borderColor: "var(--line)" }}>
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: tag[1] }}>{tag[0]}</span>
              <span className="text-lg font-black">{t.name}</span>
              <span className="muted text-xs">{shortDate(t.starts_on)} to {shortDate(t.ends_on)}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <section className="card flex-[2]">
          <h2 className="h2">{term?.name}: tests and exams</h2>
          {(exams ?? []).length === 0 && <p className="muted">Nothing planned in this term yet.</p>}
          {(exams ?? []).map((e) => {
            const s = STATUS[e.status]; const p = progress.get(e.id) ?? 0; const next = NEXT[e.status];
            return (
              <div key={e.id} className="flex flex-col gap-2.5 rounded-2xl border-2 p-3.5"
                style={{ borderColor: e.id === exam?.id ? "var(--blue-ring)" : "var(--line)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/principal/exams?term=${term!.id}&exam=${e.id}`}>
                    <div className="eyebrow">{KIND[e.kind]} · {e.exam_sections.length} sections · counts {Number(e.weight_percent)}%</div>
                    <div className="text-lg font-black">{e.name}</div>
                    <div className="muted text-xs">{e.starts_on ? `${shortDate(e.starts_on)} to ${shortDate(e.ends_on ?? e.starts_on)}` : "No dates"} · out of {e.total_marks}</div>
                  </Link>
                  <span className={`pill ${s[1]}`}>{s[0]}</span>
                </div>
                <div className="flex justify-between"><span className="muted">Marks entered</span><b className="text-sm">{Math.round(p * 100)}%</b></div>
                <div className="track"><i style={{ width: `${p * 100}%`, background: s[2] }} /></div>
                {next && (
                  <form action={setExamStatus} className="self-end">
                    <input type="hidden" name="exam_id" value={e.id} /><input type="hidden" name="term_id" value={term!.id} /><input type="hidden" name="status" value={next[0]} />
                    <button className="btn-ghost min-h-10 text-sm" type="submit">{next[1]}</button>
                  </form>
                )}
              </div>
            );
          })}

          {exam && (
            <>
              <h3 className="mt-2 text-lg font-black">Date sheet · {exam.name}</h3>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th scope="col">Date</th><th scope="col">Class</th><th scope="col">Subject</th><th scope="col">Time</th><th scope="col">Invigilator</th></tr></thead>
                  <tbody>
                    {((papers ?? []) as unknown as Paper[]).map((p) => (
                      <tr key={p.id}><td>{shortDate(p.paper_date)}</td><td>{p.classes.name}</td><td>{p.subjects.name}</td><td>{time(p.starts_at)}{p.ends_at ? ` to ${time(p.ends_at)}` : ""}</td><td>{p.profiles?.full_name ?? ""}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form action={addPaper} className="grid grid-cols-2 items-end gap-2 md:grid-cols-4">
                <input type="hidden" name="exam_id" value={exam.id} /><input type="hidden" name="term_id" value={term!.id} />
                <label className="field">Class<select className="input" name="class_id">{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label className="field">Subject<select className="input" name="subject_id">{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label className="field">Date<input className="input" type="date" name="paper_date" required /></label>
                <label className="field">Invigilator<select className="input" name="invigilator_id"><option value="">None</option>{(staff ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label>
                <label className="field">Starts<input className="input" type="time" name="starts_at" defaultValue="08:30" /></label>
                <label className="field">Ends<input className="input" type="time" name="ends_at" defaultValue="11:00" /></label>
                <button className="btn col-span-2" type="submit">Add paper</button>
              </form>
            </>
          )}
        </section>

        <form action={createExam} className="card flex-1">
          <h2 className="h2">Create a test or exam</h2>
          <input type="hidden" name="term_id" value={term?.id ?? ""} /><input type="hidden" name="back" value="exams" />
          <label className="field">Name (write any name you like)
            <input className="input" name="name" required list="exam-name-ideas" placeholder="December test, Pre-board, Chapter 3 quiz" />
            <datalist id="exam-name-ideas">{NAME_IDEAS.map((n) => <option key={n} value={n} />)}</datalist>
          </label>
          <label className="field">Kind (for the report card)
            <select className="input" name="kind">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <fieldset className="field">
            <legend className="mb-1.5">Classes</legend>
            <div className="flex flex-wrap gap-2">
              {(classes ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm" style={{ borderColor: "var(--line)" }}>
                  <input type="checkbox" name="class_id" value={c.id} defaultChecked /> {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          {(classes ?? []).length < 10 && (
            <p className="muted">Only {(classes ?? []).length} classes are set up. <button formAction={addStandardClasses} formNoValidate className="underline" type="submit">Add Class 1 to Class 10</button></p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Starts<input className="input" type="date" name="starts_on" /></label>
            <label className="field">Ends<input className="input" type="date" name="ends_on" /></label>
            <label className="field">Total marks<input className="input" type="number" name="total_marks" defaultValue={25} min={1} /></label>
            <label className="field">Counts toward final %<input className="input" type="number" name="weight_percent" defaultValue={10} min={0} max={100} /></label>
          </div>
          <label className="field">Grading
            <select className="input" name="grading_scale_id">{(scales ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          </label>
          <button className="btn" type="submit">Create</button>
          <p className="muted">Subject teachers fill marks when you open marks entry. Publishing results locks them.</p>
        </form>
      </div>
    </>
  );
}
