"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitHomework } from "@/app/(app)/homework/actions";

// Hand in one homework: take or choose a photo of the work, add a note, send.
export function HomeworkSubmit({ homeworkId, studentId, done }: { homeworkId: string; studentId: string; done: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(file: File) {
    setBusy(true); setMsg(null);
    try {
      // shrink big phone photos to about 1600px so they upload quickly
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Could not read the picture."))), "image/jpeg", 0.8));
      const path = `${studentId}/${homeworkId}-${Date.now()}.jpg`;
      const up = await createClient().storage.from("homework").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw new Error(up.error.message);
      const r = await submitHomework(homeworkId, studentId, path, note);
      if (r.error) throw new Error(r.error);
      setMsg("Sent to the teacher."); setOpen(false); router.refresh();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} />
      {open ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <input className="input min-h-9 w-40 py-1 text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note for the teacher" />
          <button type="button" className="btn min-h-9 px-3 text-xs" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Sending…" : "Photo & send"}</button>
        </div>
      ) : <button type="button" className="btn-ghost min-h-9 px-3 text-xs" onClick={() => setOpen(true)}>{done ? "Send again" : "Hand in"}</button>}
      {msg && <span className="text-xs font-extrabold">{msg}</span>}
    </div>
  );
}
