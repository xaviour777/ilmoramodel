"use client";

import { useState, useTransition } from "react";
import { draftBankQuestions, saveDrafts } from "@/app/(app)/teacher/paper-check/bank-actions";
import type { BankDraft } from "@/lib/paper-check/quiz";

const KIND: Record<string, string> = { mcq: "MCQ", short: "Short", long: "Long" };

// AI drafts one chapter's questions; the teacher unticks the weak ones and saves the rest to the bank.
export function AiBankHelper({ classId, subjectId, className, subject, chapter: start }: { classId: string; subjectId: string; className: string; subject: string; chapter: string }) {
  const [chapter, setChapter] = useState(start);
  const [n, setN] = useState({ mcq: 15, short: 12, long: 4 });
  const [language, setLanguage] = useState<"en" | "ur">("en");
  const [items, setItems] = useState<(BankDraft[number] & { keep: boolean })[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start2] = useTransition();

  const draft = () => start2(async () => {
    setNote(null);
    const r = await draftBankQuestions({ subject, className, chapter, ...n, language });
    if ("error" in r) return setNote({ ok: false, text: r.error });
    setItems(r.map((q) => ({ ...q, keep: true })));
    setNote({ ok: true, text: `AI made ${r.length} questions. Read each one, untick any that are wrong, then save.` });
  });
  const save = () => start2(async () => {
    const r = await saveDrafts({ classId, subjectId, chapter, items: items.filter((q) => q.keep) });
    if ("error" in r) return setNote({ ok: false, text: r.error });
    setItems([]);
    setNote({ ok: true, text: `${r.saved} questions saved to the bank.` });
    window.location.reload();
  });
  const edit = (i: number, patch: Partial<(typeof items)[number]>) => setItems(items.map((q, k) => (k === i ? { ...q, ...patch } : q)));

  return (
    <section className="card">
      <h2 className="h2">Make questions with AI</h2>
      <p className="muted">AI writes a chapter&apos;s questions in the Punjab board style. Nothing goes into the bank until you check and save it.</p>
      <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-6">
        <label className="field col-span-2">Chapter<input className="input" value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="e.g. 2. Kinematics" /></label>
        <label className="field">MCQs<input className="input" type="number" min={0} max={30} value={n.mcq} onChange={(e) => setN({ ...n, mcq: Number(e.target.value) })} /></label>
        <label className="field">Short<input className="input" type="number" min={0} max={30} value={n.short} onChange={(e) => setN({ ...n, short: Number(e.target.value) })} /></label>
        <label className="field">Long<input className="input" type="number" min={0} max={10} value={n.long} onChange={(e) => setN({ ...n, long: Number(e.target.value) })} /></label>
        <label className="field">Language<select className="input" value={language} onChange={(e) => setLanguage(e.target.value as "en" | "ur")}><option value="en">English</option><option value="ur">Urdu</option></select></label>
      </div>
      <button className="btn self-start" type="button" onClick={draft} disabled={busy}>{busy ? "Working…" : "Make with AI"}</button>
      {note && <div className={note.ok ? "notice-ok" : "notice-bad"}>{note.text}</div>}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((q, i) => (
            <div key={i} className="flex gap-2 rounded-xl p-2" style={{ background: "var(--page)", opacity: q.keep ? 1 : 0.5 }}>
              <input type="checkbox" checked={q.keep} onChange={(e) => edit(i, { keep: e.target.checked })} aria-label="Keep this question" />
              <div className="flex flex-1 flex-col gap-1">
                <span className="pill pill-gray self-start">{KIND[q.kind]}</span>
                <textarea className="input" dir="auto" rows={2} value={q.question} onChange={(e) => edit(i, { question: e.target.value })} />
                {q.kind === "mcq" ? (
                  <div className="text-sm font-bold" dir="auto">{q.options.map((o, k) => <span key={k} className="mr-3">({"ABCD"[k]}) {o}</span>)} · Answer: <b>{q.answer}</b></div>
                ) : (
                  <div className="muted text-sm" dir="auto">Answer: {q.answer}</div>
                )}
              </div>
            </div>
          ))}
          <button className="btn self-start" type="button" onClick={save} disabled={busy}>Save {items.filter((q) => q.keep).length} to the bank</button>
        </div>
      )}
    </section>
  );
}
