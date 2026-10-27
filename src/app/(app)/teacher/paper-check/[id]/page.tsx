import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { Tabs } from "@/components/tabs";
import { shortDate } from "@/lib/format";
import { reviewOrder } from "@/lib/paper-check/rubric";
import { FLAG_LABEL, loadSheets, loadTest, maxMarksOf, testLabel, weaknessReport } from "@/lib/paper-check/data";
import { acceptAllAi, approveTest, fixMcq, markAbsent, markAnswer, submitTest } from "../actions";

type Search = { tab?: string; saved?: string; error?: string };

const SHEET_STATUS: Record<string, [string, string]> = {
  pending: ["Not scanned", "pill-gray"],
  scanned: ["Check", "pill-orange"],
  reviewed: ["Done", "pill-green"],
  absent: ["Absent", "pill-gray"],
};

export default async function PaperTestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const { id } = await params;
  const sp = await searchParams;
  const test = await loadTest(id);
  if (!test) notFound();
  const sheets = await loadSheets(id);
  const max = maxMarksOf(test);
  const isAdmin = me.role === "principal" || me.role === "owner";
  const open = test.status === "checking";
  const tab = sp.tab === "review" || sp.tab === "weak" ? sp.tab : "students";
  const base = `/teacher/paper-check/${id}`;

  const counts = {
    total: sheets.length,
    scanned: sheets.filter((s) => s.status !== "pending").length,
    done: sheets.filter((s) => s.status === "reviewed" || s.status === "absent").length,
    check: sheets.filter((s) => s.status === "scanned").length,
  };
  const marked = sheets.filter((s) => s.total != null);
  const average = marked.length ? marked.reduce((a, s) => a + Number(s.total), 0) / marked.length : null;

  // Review queue: every written answer still waiting for the teacher, hardest first, then MCQ problems.
  const queue = reviewOrder(
    sheets
      .filter((s) => s.status === "scanned")
      .flatMap((s) => s.answers.filter((a) => a.finalMarks == null).map((a) => ({ ...a, sheet: s }))),
  );
  const mcqProblems = sheets.filter((s) => s.status === "scanned" && s.flags.some((f) => f === "DOUBLE_FILLED" || f === "BLURRY"));
  const report = tab === "weak" ? weaknessReport(test, sheets) : null;

  return (
    <>
      <div>
        <Link href="/teacher/paper-check" className="muted text-sm underline">Paper checking</Link>
        <h1 className="h1">{test.title}</h1>
        <p className="muted text-base">{testLabel(test)} · {shortDate(test.test_date)} · out of {max}{test.mcq_key.length > 0 && ` · ${test.mcq_key.length} MCQs`}{test.questions.length > 0 && ` · ${test.questions.length} written`}</p>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved === "submitted" && <div className="notice-ok">Sent to the principal for approval.</div>}
      {sp.saved === "approved" && <div className="notice-ok">Approved. Students and parents can now see these results.</div>}

      <section className="card">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="tile"><div className="muted text-xs font-extrabold uppercase">Scanned</div><div className="text-2xl font-black">{counts.scanned}/{counts.total}</div></div>
          <div className="tile"><div className="muted text-xs font-extrabold uppercase">To check</div><div className="text-2xl font-black">{counts.check}</div></div>
          <div className="tile"><div className="muted text-xs font-extrabold uppercase">Done</div><div className="text-2xl font-black">{counts.done}/{counts.total}</div></div>
          <div className="tile"><div className="muted text-xs font-extrabold uppercase">Class average</div><div className="text-2xl font-black">{average == null ? "–" : `${average.toFixed(1)}/${max}`}</div></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/print/paper-check/${id}`} target="_blank" className="btn btn-ghost">Print answer sheets</Link>
          {open && <Link href={`${base}/scan`} className="btn">Scan papers</Link>}
          {open && (
            <form action={submitTest}>
              <input type="hidden" name="test_id" value={id} />
              <button className="btn btn-ghost" type="submit" disabled={counts.done < counts.total}>
                {counts.done < counts.total ? `${counts.total - counts.done} papers left` : "Send to principal"}
              </button>
            </form>
          )}
          {test.status === "submitted" && (isAdmin ? (
            <form action={approveTest}>
              <input type="hidden" name="test_id" value={id} />
              <button className="btn" type="submit">Approve results</button>
            </form>
          ) : <span className="pill pill-orange">Waiting for the principal</span>)}
          {test.status === "approved" && <span className="pill pill-green">Results out</span>}
        </div>
      </section>

      <Tabs current={tab} tabs={[
        { id: "students", label: `Students (${counts.total})`, href: `${base}?tab=students` },
        { id: "review", label: `To check (${queue.length + mcqProblems.length})`, href: `${base}?tab=review` },
        { id: "weak", label: "Weak areas", href: `${base}?tab=weak` },
      ]} />

      {tab === "students" && (
        <section className="card" id="students">
          {sheets.map((s) => {
            const [label, cls] = SHEET_STATUS[s.status];
            return (
              <div key={s.id} className="row-box">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold">{s.students?.full_name}</div>
                  <div className="muted text-xs">Roll {s.students?.roll_no ?? "-"}{s.flags.length > 0 && ` · ${s.flags.map((f) => FLAG_LABEL[f] ?? f).join(", ")}`}</div>
                </div>
                <div className="w-20 text-right font-black">{s.total != null ? `${Number(s.total)}/${max}` : s.status === "scanned" ? `MCQ ${Number(s.mcq_score)}` : ""}</div>
                <span className={`pill ${cls}`}>{label}</span>
                {open && s.status === "pending" && (
                  <form action={markAbsent}>
                    <input type="hidden" name="sheet_id" value={s.id} />
                    <button className="muted text-xs underline" type="submit">Absent</button>
                  </form>
                )}
              </div>
            );
          })}
        </section>
      )}

      {tab === "review" && (
        <section className="card" id="review">
          {queue.length === 0 && mcqProblems.length === 0 && <p className="muted">Nothing to check. Scanned papers with clear MCQs and marked answers are done.</p>}
          {mcqProblems.map((s) => (
            <form key={`mcq-${s.id}`} action={fixMcq} className="flex flex-col gap-2 rounded-2xl border-2 p-3.5" style={{ borderColor: "var(--orange)" }}>
              <input type="hidden" name="sheet_id" value={s.id} />
              <div className="font-extrabold">{s.students?.full_name} · MCQs <span className="muted text-sm">({s.flags.map((f) => FLAG_LABEL[f] ?? f).join(", ")})</span></div>
              <p className="muted text-sm">Look at the paper and type what the student chose, one letter per MCQ. Use - for blank or two bubbles.</p>
              <input className="input font-mono uppercase tracking-widest" name="mcq" disabled={!open}
                defaultValue={(s.mcq_answers ?? []).map((a) => (a && a !== "*" ? a : "-")).join("")} />
              <button className="btn self-end" type="submit" disabled={!open}>Save MCQs</button>
            </form>
          ))}
          {queue.map((a) => {
            const q = test.questions.find((x) => x.no === a.no);
            if (!q) return null;
            return (
              <div key={`${a.sheet.id}-${a.no}`} className="flex flex-col gap-2.5 rounded-2xl border-2 p-3.5" style={{ borderColor: "var(--line)" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-extrabold">{a.sheet.students?.full_name} · Q{q.no} <span className="muted">out of {q.maxMarks}</span></div>
                  <div className="muted text-xs">{q.rubric.map((p) => `${p.point} ${p.marks}`).join(", ")}</div>
                </div>
                <div className="text-sm">{q.prompt}</div>
                {a.cropUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={a.cropUrl} alt={`Answer to question ${q.no}`} className="w-full rounded-xl border-2" style={{ borderColor: "var(--line)" }} />
                  : <p className="muted text-sm">No photo of this answer.</p>}
                {a.ai && (
                  <div className="rounded-xl p-2.5 text-sm" style={{ background: "var(--purple-soft)", color: "var(--purple-ink)" }}>
                    <b>{a.ai.provider === "claude" ? "AI suggests" : "Demo AI"}: {a.ai.marks == null ? "please mark this yourself" : `${a.ai.marks}/${q.maxMarks}`}</b>
                    {a.ai.marks != null && ` (${Math.round(a.ai.confidence * 100)}% sure)`}. {a.ai.reason}
                    {a.ai.missingPoints.length > 0 && <div>Missing: {a.ai.missingPoints.join(", ")}</div>}
                  </div>
                )}
                {open && (
                  <div className="flex flex-wrap items-center gap-2">
                    {a.ai?.marks != null && (
                      <form action={markAnswer}>
                        <input type="hidden" name="sheet_id" value={a.sheet.id} />
                        <input type="hidden" name="no" value={q.no} />
                        <input type="hidden" name="marks" value="accept" />
                        <button className="btn" type="submit">Accept {a.ai.marks}</button>
                      </form>
                    )}
                    {Array.from({ length: Math.floor(q.maxMarks) + 1 }, (_, m) => (
                      <form key={m} action={markAnswer}>
                        <input type="hidden" name="sheet_id" value={a.sheet.id} />
                        <input type="hidden" name="no" value={q.no} />
                        <input type="hidden" name="marks" value={m} />
                        <button className="chip" type="submit" aria-label={`Give ${m} marks`}>{m}</button>
                      </form>
                    ))}
                    <form action={markAnswer} className="flex items-center gap-1">
                      <input type="hidden" name="sheet_id" value={a.sheet.id} />
                      <input type="hidden" name="no" value={q.no} />
                      <input className="input w-20 text-center" name="marks" inputMode="decimal" placeholder="2.5" aria-label="Other marks" />
                      <button className="btn btn-ghost" type="submit">Save</button>
                    </form>
                    {a.sheet.answers.filter((x) => x.finalMarks == null && x.ai?.marks != null).length > 1 && (
                      <form action={acceptAllAi}>
                        <input type="hidden" name="sheet_id" value={a.sheet.id} />
                        <button className="muted text-xs underline" type="submit">Accept all AI marks on this paper</button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {report && (
        <section className="card">
          <p className="muted">Based on {report.checked} checked papers.</p>
          <h2 className="h2">MCQs most students got wrong</h2>
          {report.weakMcqs.length === 0 && <p className="muted">No MCQ was missed by more than half the class.</p>}
          {report.weakMcqs.map((m) => (
            <div key={m.question} className="row-box">
              <div className="flex-1 font-extrabold">MCQ {m.question} <span className="muted text-xs">answer {m.key}{m.commonWrong && m.commonWrong !== "blank" ? `, many chose ${m.commonWrong}` : ""}</span></div>
              <span className="pill pill-red">{m.correctPct}% right</span>
            </div>
          ))}
          {report.written.length > 0 && <h2 className="h2">Written questions</h2>}
          {report.written.map((w) => (
            <div key={w.question} className="row-box">
              <div className="min-w-0 flex-1">
                <div className="font-extrabold">Q{w.question}{w.topic && ` · ${w.topic}`}</div>
                {w.mostMissed.length > 0 && <div className="muted text-xs">Often missing: {w.mostMissed.join(", ")}</div>}
              </div>
              <span className={`pill ${w.averagePct < 50 ? "pill-red" : "pill-green"}`}>{w.averagePct}% average</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
