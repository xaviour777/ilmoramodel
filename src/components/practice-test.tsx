"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishPractice, startPractice, type PracticeQ } from "@/app/(app)/progress/actions";

type Topic = { subject_id: string; subject: string; chapter: string; questions: number };

// Ten MCQs from the school's question bank; marked at once, right answers shown after.
export function PracticeTest({ studentId, topics }: { studentId: string; topics: Topic[] }) {
  const router = useRouter();
  const [pick, setPick] = useState(0);
  const [qs, setQs] = useState<PracticeQ[] | null>(null);
  const [ans, setAns] = useState<Record<string, string>>({});
  const [res, setRes] = useState<{ total: number; correct: number; details: { id: string; given: string | null; answer: string; ok: boolean }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = topics[pick];
  if (!topics.length) return <p className="muted">No practice questions for this class yet. Teachers add MCQs to the question bank, then they show here.</p>;

  async function start() {
    setBusy(true); setErr(null); setRes(null); setAns({});
    const r = await startPractice(studentId, t.subject_id, t.chapter);
    setBusy(false);
    if (r.error) setErr(r.error); else setQs(r.questions);
  }
  async function finish() {
    setBusy(true); setErr(null);
    const r = await finishPractice(studentId, t.subject_id, t.chapter, ans);
    setBusy(false);
    if (r.error) setErr(r.error); else { setRes(r.result); router.refresh(); }
  }
  const L = ["A", "B", "C", "D", "E"];
  return (
    <div className="flex flex-col gap-3">
      {!qs && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="field flex-1">Subject and chapter
            <select className="input" value={pick} onChange={(e) => setPick(Number(e.target.value))}>
              {topics.map((x, i) => <option key={i} value={i}>{x.subject} · {x.chapter} ({x.questions})</option>)}
            </select>
          </label>
          <button type="button" className="btn" disabled={busy} onClick={start}>{busy ? "Loading…" : "Start 10 questions"}</button>
        </div>
      )}
      {qs && (
        <div className="flex flex-col gap-3">
          {qs.map((q, i) => {
            const d = res?.details.find((x) => x.id === q.id);
            return (
              <fieldset key={q.id} className="rounded-xl border-2 p-3" style={{ borderColor: d ? (d.ok ? "var(--green)" : "var(--red)") : "var(--line)" }}>
                <legend className="px-1 font-black">{i + 1}. {q.question}</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {q.options.map((o, j) => (
                    <label key={j} className="flex items-center gap-2 rounded-lg p-1.5 text-sm font-bold" style={d && L[j] === d.answer ? { background: "var(--green-soft)" } : undefined}>
                      <input type="radio" name={q.id} disabled={!!res} checked={ans[q.id] === L[j]} onChange={() => setAns({ ...ans, [q.id]: L[j] })} /> {L[j]}. {o}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
          {res ? (
            <div className="flex flex-wrap items-center gap-3"><div className="notice-ok flex-1">{res.correct} of {res.total} right. The right answers are in green.</div>
              <button type="button" className="btn-ghost" onClick={() => { setQs(null); setRes(null); }}>Another test</button></div>
          ) : <button type="button" className="btn self-start" disabled={busy || Object.keys(ans).length < qs.length} onClick={finish}>{busy ? "Marking…" : `Finish (${Object.keys(ans).length}/${qs.length} answered)`}</button>}
        </div>
      )}
      {err && <div className="notice-bad">{err}</div>}
    </div>
  );
}
