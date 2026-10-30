"use client";

import { useRef, useState, useTransition } from "react";
import { draftNotice } from "@/app/(app)/principal/actions";

// Fills the notice form's Title and Message from a few words; the principal reads and edits before publishing.
export function NoticeWriter() {
  const box = useRef<HTMLDivElement>(null);
  const [idea, setIdea] = useState("");
  const [lang, setLang] = useState("en");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const write = () => start(async () => {
    const r = await draftNotice(idea, lang);
    if ("error" in r) { setNote(r.error); return; }
    const form = box.current?.closest("form");
    const title = form?.elements.namedItem("title") as HTMLInputElement | null;
    const body = form?.elements.namedItem("body") as HTMLTextAreaElement | null;
    if (title) title.value = r.title;
    if (body) body.value = r.body;
    setNote(r.provider === "demo" ? "Written by Demo AI from a template. Read it and edit before publishing." : "Written by AI. Read it and edit before publishing.");
  });

  return (
    <div ref={box} className="flex flex-col gap-2 rounded-2xl border-2 p-3" style={{ borderColor: "var(--line)" }}>
      <label className="field">Write it for me (a few words)
        <input className="input" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="school closed Monday due to smog, online homework" />
      </label>
      <div className="flex gap-2">
        <select className="input min-h-10 w-36 py-1 text-sm" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
          <option value="en">English</option>
          <option value="roman_urdu">Roman Urdu</option>
        </select>
        <button className="btn-ghost min-h-10 px-3 text-sm" type="button" onClick={write} disabled={pending}>{pending ? "Writing..." : "Write notice"}</button>
      </div>
      {note && <p className="muted text-xs" aria-live="polite">{note}</p>}
    </div>
  );
}
