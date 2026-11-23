"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { createSyllabus } from "./actions";

const WAYS = [
  { id: "pdf", label: "📄 Book PDF", help: "Choose the book's PDF. Ilmora reads its first pages (the contents) on this phone or computer; the PDF itself is not uploaded." },
  { id: "photo", label: "📷 Photo of contents", help: "Take a clear photo of the contents page. The AI reads chapters, topics and page numbers from it." },
  { id: "typed", label: "⌨️ Type the contents", help: "One chapter per line, topics under it. Page numbers are optional. No AI needed." },
  { id: "ai", label: "✨ AI knows the book", help: "For Punjab textbooks: the AI lists the chapters it knows. Check them after." },
] as const;

function Go() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Reading the book and planning every period…" : "Make the whole-year plan"}</button>;
}

// Reads the first pages of a PDF in the browser and keeps only the text.
async function pdfText(file: File) {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const out: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out.push((tc.items as { str?: string; hasEOL?: boolean }[]).map((t) => (t.str ?? "") + (t.hasEOL ? "\n" : " ")).join(""));
  }
  return { text: out.join("\n").replace(/[ \t]+/g, " ").trim(), pages: pdf.numPages };
}

// Shrinks a photo to a JPEG the AI can read.
async function photoData(file: File) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

export function SyllabusSetup({ classId, subjectId, title, starts, finish, ppw, aiReady }: { classId: string; subjectId: string; title: string; starts: string; finish: string; ppw: number; aiReady: boolean }) {
  const [way, setWay] = useState<(typeof WAYS)[number]["id"]>(aiReady ? "pdf" : "typed");
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setNote("");
    try {
      if (way === "pdf") {
        const r = await pdfText(f);
        setText(r.text);
        setNote(r.text.length > 200 ? `Read ${Math.min(r.pages, 20)} of ${r.pages} pages. Ready.` : "This PDF is scanned pictures, so there is no text to read. Take a photo of the contents page instead.");
      } else {
        setImage(await photoData(f));
        setNote("Photo ready.");
      }
    } catch (err) {
      setNote(`Could not read the file: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={createSyllabus} className="card flex flex-col gap-3">
      <input type="hidden" name="class_id" value={classId} /><input type="hidden" name="subject_id" value={subjectId} />
      <input type="hidden" name="source" value={way} />
      {way !== "typed" && <input type="hidden" name="text" value={text} />}
      <input type="hidden" name="image" value={way === "photo" ? image : ""} />
      <h2 className="h2">1 · Give the book</h2>
      <div className="flex flex-wrap gap-2">
        {WAYS.map((w) => (
          <button key={w.id} type="button" onClick={() => { setWay(w.id); setNote(""); }} className={way === w.id ? "btn min-h-10 px-3 text-sm" : "btn-ghost min-h-10 px-3 text-sm"}>{w.label}</button>
        ))}
      </div>
      <p className="muted text-sm">{WAYS.find((w) => w.id === way)!.help}</p>
      {!aiReady && way !== "typed" && <div className="notice-warn">AI is not on yet, so only typed contents (or a PDF with a plain contents page) can be read. The principal adds a Gemini, OpenAI or Claude key in Settings → AI.</div>}
      {(way === "pdf" || way === "photo") && (
        <label className="field">{way === "pdf" ? "Book PDF" : "Contents page photo"}
          <input className="input py-2" type="file" accept={way === "pdf" ? "application/pdf" : "image/*"} capture={way === "photo" ? "environment" : undefined} onChange={onFile} />
        </label>
      )}
      {busy && <p className="text-sm font-bold">Reading…</p>}
      {note && <p className="text-sm font-bold">{note}</p>}
      {way === "typed" && (
        <label className="field">Contents
          <textarea className="input min-h-48 py-2 font-mono text-sm" name="text" required placeholder={"1 Physical quantities and measurement (p 1-24)\n1.1 Introduction to physics (p 2-4)\n1.2 Physical quantities (p 5-8)\n2 Kinematics (p 25-52)\n2.1 Rest and motion"} />
        </label>
      )}
      <h2 className="h2">2 · Dates</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="field">Book name<input className="input" name="title" defaultValue={title} /></label>
        <label className="field">Start teaching<input className="input" type="date" name="starts_on" defaultValue={starts} required /></label>
        <label className="field">Finish the book by<input className="input" type="date" name="finish_by" defaultValue={finish} required /></label>
        <label className="field">Periods a week<input className="input" type="number" min={1} max={14} name="periods_per_week" defaultValue={ppw} /></label>
      </div>
      <p className="muted text-sm">Periods come from the timetable when it has this subject. Sundays, holidays and this class&apos;s exam days are skipped. Every chapter ends with a short test.</p>
      <Go />
    </form>
  );
}
