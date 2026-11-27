import { moduleOn } from "@/lib/modules";
import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { mySections } from "@/lib/teacher";
import { pct, shortDate, todayPK } from "@/lib/format";
import { mobilePK, whatsappLink } from "@/lib/messages";
import { Tabs } from "@/components/tabs";
import { addRemedial, endRemedial, noticeToSection } from "./actions";
import { classExtraTabs } from "./extra-tabs";

type Search = { section?: string; tab?: string; exam?: string; hw?: string; saved?: string; error?: string };
type M = { exam_id: string; student_id: string; subject_id: string; obtained: number | null; is_absent: boolean };
const GR = [["A+", 0.8], ["A", 0.7], ["B", 0.6], ["C", 0.5], ["D", 0.4], ["F", 0]] as const;

// One place for a teacher's class: gradebook, test analysis, remedial list and messages to parents.
export default async function TeacherClass({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const sections = await mySections(me.id);
  const sec = sections.find((s) => s.id === sp.section) ?? sections[0];
  const tab = ["grades", "analysis", "remedial", "message"].includes(sp.tab ?? "") ? sp.tab! : "grades";
  if (!sec) return <><h1 className="h1">My class</h1><p className="muted">You don&apos;t teach any section yet.</p></>;
  const base = (o: Partial<Search>) => "/teacher/class?" + new URLSearchParams(Object.entries({ section: sec.id, tab, ...o }).filter(([, v]) => v) as [string, string][]);
  const back = base({});
  const [{ data: kids }, { data: mySubs }, { data: exams }] = await Promise.all([
    supabase.from("students").select("id, full_name, roll_no, family_id, families(phone, reminder_phone)").eq("section_id", sec.id).eq("status", "enrolled").order("roll_no").order("full_name"),
    supabase.from("section_subjects").select("subject_id, teacher_id, subjects(name)").eq("section_id", sec.id),
    supabase.from("exams").select("id, name, total_marks, starts_on, status, exam_sections!inner(section_id)").eq("exam_sections.section_id", sec.id).order("starts_on", { ascending: true, nullsFirst: true }),
  ]);
  type K = { id: string; full_name: string; roll_no: string | null; family_id: string | null; families: { phone: string | null; reminder_phone: string | null } | null };
  const K = (kids ?? []) as unknown as K[];
  const subjects = ((mySubs ?? []) as unknown as { subject_id: string; teacher_id: string | null; subjects: { name: string } }[]).filter((s) => sec.isClassTeacher || s.teacher_id === me.id || me.role !== "teacher");
  const ids = K.map((k) => k.id);
  const exIds = (exams ?? []).map((e) => e.id);
  const [{ data: marks }, { data: hws }, { data: rem }] = await Promise.all([
    exIds.length && ids.length ? supabase.from("marks").select("exam_id, student_id, subject_id, obtained, is_absent").in("exam_id", exIds).in("student_id", ids).limit(10000) : Promise.resolve({ data: [] as M[] }),
    supabase.from("homework_progress").select("homework_id, title, due_on").eq("section_id", sec.id).order("due_on", { ascending: false }).limit(40),
    supabase.from("remedial_students").select("id, student_id, subject_id, reason, plan, started_on, status, ended_on").eq("section_id", sec.id).order("started_on", { ascending: false }),
  ]);
  const hwIds = (hws ?? []).map((h) => h.homework_id);
  const { data: hsub } = hwIds.length ? await supabase.from("homework_submissions").select("homework_id, student_id, submitted_at, marks").in("homework_id", hwIds) : { data: [] };
  const total = new Map((exams ?? []).map((e) => [e.id, e.total_marks || 100]));
  const M = (marks ?? []) as M[];
  const subjIds = new Set(subjects.map((s) => s.subject_id));
  const mine = M.filter((m) => subjIds.has(m.subject_id));
  const r = (m: M) => (m.is_absent || m.obtained == null ? 0 : Number(m.obtained) / (total.get(m.exam_id) ?? 100));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const stuAvg = (id: string) => avg(mine.filter((m) => m.student_id === id).map(r));
  const hwDone = (id: string) => { const n = (hws ?? []).length; return n ? (hsub ?? []).filter((h) => h.student_id === id && h.submitted_at).length / n : null; };
  const saved = sp.saved?.startsWith("remedial-") ? `${sp.saved.slice(9)} added to the remedial list.` : sp.saved === "notice" ? "Sent to the parents of the section in the app." : sp.saved ? "Saved." : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">My class</h1><p className="muted text-base">Gradebook, test analysis, remedial list and messages to parents.</p></div>
        <Tabs current={tab} tabs={[...[["grades", "Gradebook"], ["analysis", "Test analysis"], ["remedial", "Remedial"], ["message", "Message parents"]].map(([id, label]) => ({ id, label, href: base({ tab: id }) })), ...classExtraTabs(sec.id, await moduleOn("passport"))]} />
      </div>
      <div className="flex flex-wrap gap-2">{sections.map((s) => <Link key={s.id} href={`/teacher/class?section=${s.id}&tab=${tab}`} className="chip" style={s.id === sec.id ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)" } : undefined}>{s.label}</Link>)}</div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {saved && <div className="notice-ok">{saved}</div>}

      {tab === "grades" && (
        <section className="card">
          <h2 className="h2">Gradebook · {sec.label}</h2>
          <p className="muted text-sm">Every test of this session in {subjects.map((s) => s.subjects.name).join(", ") || "your subjects"}, homework handed in, and the overall: tests 80% + homework 20%.</p>
          {K.length === 0 ? <p className="muted">No students.</p> : (
            <div className="overflow-x-auto"><table className="tbl min-w-[640px]">
              <thead><tr><th>Roll</th><th>Student</th>{(exams ?? []).map((e) => <th key={e.id}>{e.name}{e.status !== "results" ? " *" : ""}</th>)}<th>Homework</th><th>Overall</th></tr></thead>
              <tbody>{K.map((k) => {
                const a = stuAvg(k.id), h = hwDone(k.id);
                const o = a == null && h == null ? null : (a ?? 0) * (h == null ? 1 : 0.8) + (h ?? 0) * (a == null ? 1 : 0.2);
                return (
                  <tr key={k.id}><td>{k.roll_no}</td><td>{k.full_name}</td>
                    {(exams ?? []).map((e) => { const v = avg(mine.filter((m) => m.exam_id === e.id && m.student_id === k.id).map(r)); return <td key={e.id} className="tabular-nums">{v == null ? "—" : pct(v)}</td>; })}
                    <td className="tabular-nums">{h == null ? "—" : pct(h)}</td><td className="font-black tabular-nums">{o == null ? "—" : `${pct(o)} ${GR.find(([, m]) => o >= m)![0]}`}</td></tr>
                );
              })}</tbody>
            </table></div>
          )}
          <p className="muted text-xs">* not published yet: parents don&apos;t see it.</p>
        </section>
      )}

      {tab === "analysis" && (() => {
        const ex = (exams ?? []).filter((e) => mine.some((m) => m.exam_id === e.id));
        const cur = ex.find((e) => e.id === sp.exam) ?? ex.at(-1);
        if (!cur) return <section className="card"><p className="muted">No marks entered for your subjects in this section yet.</p></section>;
        const prev = ex[ex.findIndex((e) => e.id === cur.id) - 1];
        const rows = K.map((k) => ({ k, v: avg(mine.filter((m) => m.exam_id === cur.id && m.student_id === k.id).map(r)), p: prev ? avg(mine.filter((m) => m.exam_id === prev.id && m.student_id === k.id).map(r)) : null })).filter((x) => x.v != null) as { k: K; v: number; p: number | null }[];
        const a = avg(rows.map((x) => x.v))!, pa = prev ? avg(rows.filter((x) => x.p != null).map((x) => x.p!)) : null;
        const spread = GR.map(([g, min], i) => ({ g, n: rows.filter((x) => x.v >= min && (i === 0 || x.v < GR[i - 1][1])).length }));
        const bySub = subjects.map((s) => ({ n: s.subjects.name, v: avg(mine.filter((m) => m.exam_id === cur.id && m.subject_id === s.subject_id).map(r)) })).filter((x) => x.v != null);
        const max = Math.max(1, ...spread.map((x) => x.n));
        return (
          <section className="card">
            <div className="flex flex-wrap gap-2">{ex.map((e) => <Link key={e.id} href={base({ exam: e.id })} className={`pill ${e.id === cur.id ? "pill-blue" : "pill-gray"}`}>{e.name}</Link>)}</div>
            <h2 className="h2">{cur.name} · {sec.label}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="tile"><span className="muted">Class average</span><b>{pct(a)}</b><span className="muted text-xs">{pa != null ? `${a >= pa ? "▲" : "▼"} ${Math.abs(Math.round((a - pa) * 100))} pts vs ${prev!.name}` : ""}</span></div>
              <div className="tile"><span className="muted">Passed (40%+)</span><b>{rows.filter((x) => x.v >= 0.4).length}/{rows.length}</b></div>
              <div className="tile"><span className="muted">Highest</span><b>{pct(Math.max(...rows.map((x) => x.v)))}</b></div>
              <div className="tile"><span className="muted">Lowest</span><b>{pct(Math.min(...rows.map((x) => x.v)))}</b></div>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div><h3 className="font-black">Grade spread</h3>{spread.map((x) => <div key={x.g} className="flex items-center gap-2"><span className="w-8 font-black">{x.g}</span><div className="track flex-1"><i style={{ width: `${(x.n / max) * 100}%` }} /></div><span className="w-6 text-right font-black">{x.n}</span></div>)}
                {bySub.length > 1 && <><h3 className="mt-2 font-black">By subject</h3>{bySub.map((x) => <div key={x.n} className="flex justify-between text-sm font-bold"><span>{x.n}</span><span>{pct(x.v!)}</span></div>)}</>}</div>
              <div><h3 className="font-black">Needs help (below 50% or dropped 10+)</h3>
                {rows.filter((x) => x.v < 0.5 || (x.p != null && x.v - x.p <= -0.1)).sort((p, q) => p.v - q.v).map((x) => (
                  <div key={x.k.id} className="flex justify-between text-sm font-bold"><span>{x.k.full_name}</span><span style={{ color: "var(--red-ink)" }}>{pct(x.v)}{x.p != null ? ` (was ${pct(x.p)})` : ""}</span></div>
                ))}
                <Link href={base({ tab: "remedial" })} className="eyebrow mt-2 inline-block">Add them to the remedial list ›</Link></div>
            </div>
            <p className="muted text-xs">Question-by-question detail is on the test in AI paper checking.</p>
          </section>
        );
      })()}

      {tab === "remedial" && (() => {
        const active = (rem ?? []).filter((x) => x.status === "active");
        const inList = new Set(active.map((x) => x.student_id));
        const since = (id: string, from: string) => avg(mine.filter((m) => m.student_id === id && ((exams ?? []).find((e) => e.id === m.exam_id)?.starts_on ?? "") >= from).map(r));
        const before = (id: string, from: string) => avg(mine.filter((m) => m.student_id === id && ((exams ?? []).find((e) => e.id === m.exam_id)?.starts_on ?? "9999") < from).map(r));
        const cand = K.filter((k) => !inList.has(k.id)).map((k) => ({ k, a: stuAvg(k.id), h: hwDone(k.id) })).filter((x) => (x.a != null && x.a < 0.5) || (x.h != null && x.h < 0.5));
        return (
          <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
            <form action={addRemedial} className="card">
              <input type="hidden" name="section_id" value={sec.id} /><input type="hidden" name="back" value={back} />
              <h2 className="h2">Suggested for extra help</h2>
              <p className="muted text-sm">Below 50% in your subjects, or under half their homework handed in.</p>
              {cand.length === 0 && <p className="muted">Nobody right now.</p>}
              {cand.map((x) => (
                <label key={x.k.id} className="row-box">
                  <input type="checkbox" name="student_id" value={x.k.id} defaultChecked className="h-5 w-5" />
                  <span className="flex-1 font-extrabold">{x.k.full_name}</span>
                  <span className="muted text-xs">{x.a != null ? `marks ${pct(x.a)}` : ""}{x.h != null ? ` · homework ${pct(x.h)}` : ""}</span>
                  <input type="hidden" name={`reason:${x.k.id}`} value={[x.a != null && x.a < 0.5 ? `marks ${pct(x.a)}` : "", x.h != null && x.h < 0.5 ? `homework ${pct(x.h)}` : ""].filter(Boolean).join(", ")} />
                </label>
              ))}
              {cand.length > 0 && <>
                <label className="field">Subject<select className="input" name="subject_id"><option value="">All my subjects</option>{subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.subjects.name}</option>)}</select></label>
                <label className="field">Plan<input className="input" name="plan" placeholder="Extra class Tue/Thu after school, 5 sums a day" /></label>
                <button className="btn self-start" type="submit">Add to remedial list</button>
              </>}
            </form>
            <section className="card">
              <h2 className="h2">Remedial list · {active.length}</h2>
              {(rem ?? []).length === 0 && <p className="muted">No one yet.</p>}
              {(rem ?? []).map((x) => {
                const k = K.find((q) => q.id === x.student_id); const b = before(x.student_id, x.started_on), s = since(x.student_id, x.started_on);
                return (
                  <form key={x.id} action={endRemedial} className="row-box flex-wrap">
                    <input type="hidden" name="id" value={x.id} /><input type="hidden" name="back" value={back} />
                    <div className="min-w-40 flex-1"><div className="font-extrabold">{k?.full_name ?? "Student"}</div><div className="muted text-xs">since {shortDate(x.started_on)}{x.reason ? ` · ${x.reason}` : ""}{x.plan ? ` · ${x.plan}` : ""}</div></div>
                    <span className="text-sm font-black">{b != null ? pct(b) : "—"} → {s != null ? pct(s) : "no test yet"}</span>
                    {x.status === "active" ? <button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Done</button> : <span className="pill pill-green">Done</span>}
                  </form>
                );
              })}
              <p className="muted text-xs">Before → after: average in your subjects before joining, and in tests since.</p>
            </section>
          </div>
        );
      })()}

      {tab === "message" && (
        <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
          <form action={noticeToSection} className="card">
            <input type="hidden" name="section_id" value={sec.id} /><input type="hidden" name="back" value={back} />
            <h2 className="h2">To all parents of {sec.label} (in the app)</h2>
            <label className="field">Title<input className="input" name="title" required list="tpl-titles" placeholder="Test on Monday" /></label>
            <datalist id="tpl-titles">{["Test on Monday", "Homework reminder", "Bring your books", "Well done this week", "Parent-teacher meeting"].map((t) => <option key={t} value={t} />)}</datalist>
            <label className="field">Message<textarea className="input min-h-24 py-2" name="body" required placeholder="Chapter 4 test on Monday, please help your child revise." /></label>
            <button className="btn self-start" type="submit">Send in the app</button>
          </form>
          <section className="card">
            <h2 className="h2">One parent on WhatsApp</h2>
            <p className="muted text-sm">Opens WhatsApp on your phone with the message ready. Nothing is sent until you press send there.</p>
            {K.map((k) => {
              const phone = mobilePK(k.families?.reminder_phone) ?? mobilePK(k.families?.phone);
              const a = stuAvg(k.id);
              const text = `Assalam-o-Alaikum. This is ${me.full_name} from ${me.campus_name} about ${k.full_name} (${sec.label}).${a != null ? ` Average in my subject: ${pct(a)}.` : ""} `;
              return (
                <div key={k.id} className="flex items-center justify-between gap-2 text-sm font-bold">
                  <span>{k.roll_no ? `${k.roll_no}. ` : ""}{k.full_name}</span>
                  {phone ? <span className="flex gap-1.5">
                    <a className="btn-ghost min-h-9 px-2.5 text-xs" target="_blank" rel="noreferrer" href={whatsappLink(phone, text + "Please call me when you can.")}>Call me</a>
                    <a className="btn-ghost min-h-9 px-2.5 text-xs" target="_blank" rel="noreferrer" href={whatsappLink(phone, text + "Well done this week!")}>Praise</a>
                    <a className="btn-ghost min-h-9 px-2.5 text-xs" target="_blank" rel="noreferrer" href={whatsappLink(phone, text + "Homework is not being handed in. Please check daily.")}>Homework</a>
                  </span> : <span className="muted text-xs">no mobile number</span>}
                </div>
              );
            })}
            <p className="muted text-xs">Today: {shortDate(todayPK())}</p>
          </section>
        </div>
      )}
    </>
  );
}
