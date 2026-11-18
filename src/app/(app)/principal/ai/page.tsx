import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { pct, shortDate, todayPK } from "@/lib/format";
import { PageHead, Stats, Stat, Insight, Empty, Bar, Row } from "@/components/ilm";
import { UnderTabs } from "@/components/classes-tabs";

type Test = { id: string; title: string; status: string; test_date: string; mcq_key: unknown[]; mcq_marks_each: number; questions: { marks?: number }[];
  sections: { name: string; classes: { name: string } } | null; subjects: { name: string } | null; profiles?: { full_name: string } | null };
type Sheet = { test_id: string; total: number | null; status: string; flags: unknown[] };

// Every AI feature in one place (design/AITools.dc.html). The work itself happens on the existing pages it links to.
export default async function PrincipalAiTools({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole("principal", "owner");
  const { tab: t } = await searchParams;
  const tab = t === "tutor" || t === "more" ? t : "paper";
  const supabase = await createClient();
  const today = todayPK();
  const { data: term } = await supabase.from("terms").select("name, starts_on").lte("starts_on", today).gte("ends_on", today).maybeSingle();
  const since = term?.starts_on ?? today.slice(0, 8) + "01";
  const [tests, sheets, tutor, papers, bank] = await Promise.all([
    supabase.from("paper_tests").select("id, title, status, test_date, mcq_key, mcq_marks_each, questions, sections(name, classes(name)), subjects(name)").order("test_date", { ascending: false }).limit(60),
    supabase.from("paper_sheets").select("test_id, total, status, flags, scanned_at").gte("scanned_at", since + "T00:00:00").limit(20000),
    supabase.from("tutor_sessions").select("student_id, subject_name, topic, is_stuck, practice_score, created_at, students(full_name, sections(name, classes(name)))").gte("created_at", since + "T00:00:00").limit(5000),
    supabase.from("question_papers").select("id", { count: "exact", head: true }),
    supabase.from("question_bank").select("id", { count: "exact", head: true }),
  ]);
  const allTests = (tests.data ?? []) as unknown as Test[];
  const allSheets = (sheets.data ?? []) as unknown as Sheet[];
  const checked = allSheets.filter((s) => s.status === "scanned" || s.status === "reviewed");
  const reviewed = allSheets.filter((s) => s.status === "reviewed").length;
  const outOf = (x: Test) => (x.mcq_key?.length ?? 0) * Number(x.mcq_marks_each ?? 1) + (x.questions ?? []).reduce((a, q) => a + Number(q.marks ?? 0), 0);
  const testStats = new Map(allTests.map((x) => {
    const ss = allSheets.filter((s) => s.test_id === x.id && s.total != null);
    const max = outOf(x);
    return [x.id, { n: ss.length, avg: ss.length && max ? ss.reduce((a, s) => a + Number(s.total), 0) / ss.length / max : null, flagged: ss.filter((s) => (s.flags ?? []).length > 0).length, max }];
  }));
  const waiting = allTests.filter((x) => x.status === "submitted");
  const recent = allTests.filter((x) => x.status !== "submitted").slice(0, 4);
  const latest = allTests.find((x) => (testStats.get(x.id)?.n ?? 0) > 0);
  const ls = latest ? testStats.get(latest.id)! : null;
  const sessions = (tutor.data ?? []) as unknown as { student_id: string; subject_name: string; topic: string; is_stuck: boolean; practice_score: number | null; students: { full_name: string; sections: { name: string; classes: { name: string } } | null } | null }[];
  const label = (x: Test) => [x.subjects?.name, x.sections ? `${x.sections.classes.name.replace("Class ", "")}-${x.sections.name}` : ""].filter(Boolean).join(" ");

  return (
    <>
      <PageHead kick="Academics" title="AI tools" sub="Let Ilmora do the slow work. Teachers always approve before anything reaches parents." />
      <Stats>
        <Stat label="Papers checked" value={checked.length.toLocaleString("en-IN")} sub={term ? `this term · ${term.name}` : "this month"} />
        <Stat label="Teacher hours saved" value={Math.round((checked.length * 8) / 60)} tone="#15803d" sub="about 8 min per paper" />
        <Stat label="Teacher reviewed" value={checked.length ? pct(reviewed / checked.length) : "—"} sub="of checked papers" />
        <Stat label="Tutor sessions" value={sessions.length.toLocaleString("en-IN")} sub={`${new Set(sessions.map((s) => s.student_id)).size} students helped`} />
      </Stats>
      <UnderTabs current={tab} tabs={[
        { id: "paper", label: "Paper checking", href: "/principal/ai" },
        { id: "tutor", label: "Tutor reports", href: "/principal/ai?tab=tutor" },
        { id: "more", label: "Papers & question bank", href: "/principal/ai?tab=more" },
      ]} />

      {tab === "paper" && (
        <section className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-5">
            <div className="card flex flex-col gap-2.5">
              <span className="ilm-tile t-y" style={{ width: 48, height: 48, borderRadius: 14 }}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg></span>
              <h2 className="h2">Scan answer sheets</h2>
              <p className="muted text-[14px]">Make a test with its answer key, print the sheets, then scan them with a phone. MCQs are marked at once; written answers get AI marks for the teacher to approve.</p>
              <div className="flex flex-wrap gap-2.5">
                <Link href="/teacher/paper-check/new" className="btn">New test</Link>
                <Link href="/teacher/paper-check" className="btn-ghost">All tests</Link>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center justify-between gap-2"><h2 className="h2">Waiting for approval</h2>{waiting.length > 0 && <span className="tagx y">{waiting.length} test{waiting.length === 1 ? "" : "s"}</span>}</div>
              {[...waiting, ...recent].map((x) => {
                const st = testStats.get(x.id)!;
                return (
                  <Row key={x.id}>
                    <div className="min-w-0 flex-1"><div className="font-black">{x.title} · {label(x)}</div>
                      <div className="muted text-[12px]">{st.n} paper{st.n === 1 ? "" : "s"}{st.avg != null ? ` · avg ${pct(st.avg)}` : ""}{st.flagged ? ` · ${st.flagged} flagged` : ""} · {shortDate(x.test_date)}</div></div>
                    <span className={`tagx ${x.status === "submitted" ? "y" : x.status === "approved" ? "g" : "b"}`}>{x.status === "submitted" ? "To approve" : x.status === "approved" ? "Approved" : "Checking"}</span>
                    <Link href={`/teacher/paper-check/${x.id}`} className="btn-ghost" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }}>{x.status === "submitted" ? "Review" : "Open"}</Link>
                  </Row>
                );
              })}
              {allTests.length === 0 && <div className="mt-2"><Empty>No tests checked with AI yet.</Empty></div>}
            </div>
          </div>
          <div className="min-w-0 flex-[2_1_320px]">
            {latest && ls ? (
              <div className="card dark flex flex-col gap-3" style={{ background: "#1f2937", color: "#fff", borderColor: "#111827", boxShadow: "0 4px 0 #111827" }}>
                <div className="kick" style={{ color: "#fcd34d" }}>What the checking found · {label(latest)}</div>
                <ul className="ml-5 list-disc text-[14px] leading-6 font-bold">
                  <li>{ls.n} paper{ls.n === 1 ? "" : "s"} checked for &ldquo;{latest.title}&rdquo;.</li>
                  {ls.avg != null && <li>Average {pct(ls.avg)} out of {ls.max} marks.</li>}
                  <li>{ls.flagged ? `${ls.flagged} sheet${ls.flagged === 1 ? " was" : "s were"} flagged for the teacher to look at.` : "No sheet was flagged."}</li>
                </ul>
                <Link href="/teacher/paper-check/papers" className="btn self-start">Make a revision paper</Link>
              </div>
            ) : <div className="card"><Empty>Findings appear here after the first papers are scanned.</Empty></div>}
          </div>
        </section>
      )}

      {tab === "tutor" && <TutorTab sessions={sessions} />}

      {tab === "more" && (
        <section className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {[
            { href: "/teacher/paper-check/papers", tile: "t-v", title: "Question papers", body: `Board-style papers from the question bank. ${papers.count ?? 0} made so far.` },
            { href: "/teacher/paper-check/bank", tile: "t-b", title: "Question bank", body: `${(bank.count ?? 0).toLocaleString("en-IN")} questions by class, subject and chapter, with AI help to add more.` },
            { href: "/principal/notices", tile: "t-p", title: "Notice writer", body: "Write a notice in English or Urdu with AI, then send it to the app, WhatsApp or SMS." },
            { href: "/settings/ai", tile: "t-n", title: "AI settings", body: "Keys, monthly limit and which features are switched on." },
          ].map((x) => (
            <Link key={x.href} href={x.href} className="card flex flex-col gap-2 hover:border-[#7dd3fc]">
              <span className={`ilm-tile ${x.tile}`} style={{ width: 48, height: 48, borderRadius: 14 }}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg></span>
              <span className="text-[17px] font-black">{x.title}</span><span className="muted text-[14px]">{x.body}</span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}

function TutorTab({ sessions }: { sessions: { student_id: string; subject_name: string; topic: string; is_stuck: boolean; practice_score: number | null; students: { full_name: string; sections: { name: string; classes: { name: string } } | null } | null }[] }) {
  if (!sessions.length) return <Empty>No student has used the homework tutor this term yet.</Empty>;
  const bySubject = [...sessions.reduce((m, s) => m.set(s.subject_name, [...(m.get(s.subject_name) ?? []), s]), new Map<string, typeof sessions>()).entries()]
    .map(([n, v]) => ({ n, used: v.length, stuck: v.filter((x) => x.is_stuck).length })).sort((a, b) => b.stuck / b.used - a.stuck / a.used);
  const byStudent = [...sessions.reduce((m, s) => m.set(s.student_id, [...(m.get(s.student_id) ?? []), s]), new Map<string, typeof sessions>()).values()]
    .map((v) => ({ id: v[0].student_id, name: v[0].students?.full_name ?? "Student", cls: v[0].students?.sections ? `${v[0].students.sections.classes.name.replace("Class ", "")}-${v[0].students.sections.name}` : "", n: v.length, stuck: v.filter((x) => x.is_stuck).length, topics: [...new Set(v.filter((x) => x.is_stuck).map((x) => x.topic))] }))
    .sort((a, b) => b.stuck - a.stuck || b.n - a.n);
  const top = byStudent[0];
  const topicStuck = [...sessions.filter((s) => s.is_stuck).reduce((m, s) => m.set(`${s.subject_name} · ${s.topic}`, (m.get(`${s.subject_name} · ${s.topic}`) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  return (
    <section className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-5">
        {top && top.stuck > 0 && (
          <div className="card flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2"><h2 className="h2">Needs help most · <Link href={`/principal/students/${top.id}`} className="text-[#0369a1]">{top.name}</Link>{top.cls ? `, ${top.cls}` : ""}</h2><span className="tagx r">Stuck {top.stuck}×</span></div>
            <Insight>{top.name} asked the tutor {top.n} time{top.n === 1 ? "" : "s"} this term and needed the full answer {top.stuck} time{top.stuck === 1 ? "" : "s"}{top.topics.length ? `, on ${top.topics.slice(0, 3).join(", ")}` : ""}. Worth a word with the subject teacher.</Insight>
          </div>
        )}
        <div className="card">
          <h2 className="h2">Where students get stuck</h2>
          {bySubject.map((s) => (
            <Row key={s.n}><span className="w-32 font-black">{s.n}</span><div className="min-w-[100px] flex-1"><Bar value={s.stuck / s.used} color="#ef4444" /></div><span className="muted w-36 text-right text-[12px]">{s.stuck} stuck of {s.used} sessions</span></Row>
          ))}
          {topicStuck.length > 0 && <p className="muted mt-2 text-[13px]">Hardest topics: {topicStuck.slice(0, 5).map(([t, n]) => `${t} (${n})`).join(", ")}.</p>}
        </div>
      </div>
      <div className="card flex min-w-0 flex-[2_1_320px] flex-col gap-2">
        <h2 className="h2">Students using the tutor</h2>
        {byStudent.slice(0, 10).map((s) => (
          <Row key={s.id}><Link href={`/principal/students/${s.id}`} className="min-w-0 flex-1 font-black">{s.name}<span className="muted block text-[12px] font-bold">{s.cls}</span></Link>
            <span className="kick">{s.n} sessions</span>{s.stuck > 0 && <span className="tagx r">{s.stuck} stuck</span>}</Row>
        ))}
        <Link href="/teacher/tutor-report" className="btn mt-2 self-start">Full tutor report</Link>
      </div>
    </section>
  );
}
