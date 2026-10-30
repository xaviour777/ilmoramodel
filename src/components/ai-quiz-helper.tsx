"use client";

import { useState, useTransition } from "react";
import { suggestQuiz } from "@/app/(app)/teacher/paper-check/actions";
import { mcqText } from "@/lib/paper-check/quiz";

// "Make with AI" on New test: drafts MCQs and written questions, then fills the form below
// so the teacher reads and edits everything before creating the test.
export function AiQuizHelper({ formId, className }: { formId: string; className: string }) {
  const [topic, setTopic] = useState("");
  const [mcqs, setMcqs] = useState(10);
  const [written, setWritten] = useState(3);
  const [language, setLanguage] = useState<"en" | "ur">("en");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  const make = () => start(async () => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    const subjectSelect = field("subject_id") as HTMLSelectElement | null;
    const subject = subjectSelect?.selectedOptions[0]?.text ?? "";
    const options = Number(field("options_per_mcq")?.value) || 4;
    setNote(null);
    const r = await suggestQuiz({ subject, className, topic, mcqCount: mcqs, writtenCount: written, options, language });
    if ("error" in r) return setNote({ ok: false, text: r.error });
    const set = (name: string, value: string) => { const el = field(name); if (el) el.value = value; };
    set("mcq_key", r.mcqs.map((m) => m.answer).join(""));
    set("mcq_questions", mcqText(r.mcqs));
    for (let i = 0; i < 6; i++) {
      const w = r.written.at(i);
      set(`q${i + 1}_prompt`, w?.prompt ?? "");
      set(`q${i + 1}_marks`, w ? String(w.marks) : "");
      set(`q${i + 1}_rubric`, w?.rubric ?? "");
      set(`q${i + 1}_topic`, w?.topic ?? "");
    }
    if (!field("title")?.value) set("title", `${subject} test: ${topic}`.slice(0, 80));
    setNote({ ok: true, text: `AI made ${r.mcqs.length} MCQs and ${r.written.length} written questions below. Read every question and answer before you create the test.` });
  });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 p-3" style={{ borderColor: "var(--blue-ring)", background: "var(--blue-soft)" }}>
      <div className="font-black">Make the questions with AI</div>
      <div className="grid gap-3 sm:grid-cols-[1fr_90px_90px_130px]">
        <label className="field">Chapter or topic<input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ch 3: Force and motion, Newton's laws" /></label>
        <label className="field">MCQs<input className="input" type="number" min={0} max={40} value={mcqs} onChange={(e) => setMcqs(Number(e.target.value))} /></label>
        <label className="field">Written<input className="input" type="number" min={0} max={6} value={written} onChange={(e) => setWritten(Number(e.target.value))} /></label>
        <label className="field">Language
          <select className="input" value={language} onChange={(e) => setLanguage(e.target.value === "ur" ? "ur" : "en")}>
            <option value="en">English</option><option value="ur">Urdu</option>
          </select>
        </label>
      </div>
      <button type="button" className="btn self-start" onClick={make} disabled={busy}>{busy ? "Making the questions..." : "Make with AI"}</button>
      {note && <div className={note.ok ? "notice-ok" : "notice-bad"}>{note.text}</div>}
    </div>
  );
}
