"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import jsQR from "jsqr";
import { buildSheetLayout, parseSheetQr } from "@/lib/paper-check/layout";
import { readMcqAnswers, type McqAnswer } from "@/lib/paper-check/omr";
import { BLUR_LIMIT, cropRegion, findCornerMarkers, measureBubbleFills, sharpness, sheetToPhoto, toGray, type GrayImage } from "@/lib/paper-check/image";
import { FLAG_LABEL } from "@/lib/paper-check/data-labels";

type Student = { id: string; name: string; roll: string; pending: boolean };
type Pending = { answers: McqAnswer[]; blurry: boolean; crops: Array<{ no: number; dataUrl: string }> };
type Result = {
  key: string;
  state: "working" | "done" | "needs_student" | "error";
  studentId?: string;
  text?: string;
  flags?: string[];
  error?: string;
  pending?: Pending; // kept so a sheet whose QR failed can be sent once the teacher picks the student
};

const MAX_SIDE = 1600;
const CROP_PX_PER_MM = 4; // small enough to store, clear enough to read handwriting

async function loadImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { rgba: ctx.getImageData(0, 0, width, height).data, width, height };
}

function grayToDataUrl(img: GrayImage): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(img.width, img.height);
  for (let i = 0; i < img.data.length; i++) {
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = img.data[i];
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.6);
}

export function Scanner(props: { testId: string; mcqCount: number; optionsPerMcq: number; writtenCount: number; students: Student[] }) {
  const [results, setResults] = useState<Result[]>([]);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const nameOf = (id: string) => props.students.find((s) => s.id === id)?.name ?? "Student";

  const update = (key: string, patch: Partial<Result>) => setResults((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const upload = async (key: string, studentId: string, qrRead: boolean, p: Pending) => {
    const res = await fetch("/api/paper-check/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ testId: props.testId, studentId, mcqAnswers: p.answers, qrRead, blurry: p.blurry, crops: p.crops }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Upload failed");
    update(key, {
      state: "done",
      studentId,
      text: props.mcqCount ? `MCQ ${json.mcq.score}/${json.mcq.max}` : "Saved",
      flags: json.flags,
      pending: undefined,
    });
  };

  const processFile = async (file: File) => {
    const key = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 6)}`;
    setResults((rs) => [{ key, state: "working" }, ...rs]);
    try {
      const { rgba, width, height } = await loadImage(file);
      const qr = parseSheetQr(jsQR(rgba, width, height, { inversionAttempts: "dontInvert" })?.data);
      if (qr && qr.testId !== props.testId) throw new Error("This sheet belongs to a different test.");
      const gray = toGray(rgba, width, height);
      const markers = findCornerMarkers(gray);
      if (!markers) throw new Error("Could not find the 4 black corner squares. Take the photo from straight above with the whole sheet showing.");
      const h = sheetToPhoto(markers);
      const layout = buildSheetLayout(props.mcqCount, props.optionsPerMcq, props.writtenCount);
      const pending: Pending = {
        answers: readMcqAnswers(measureBubbleFills(gray, h, layout)),
        blurry: sharpness(gray) < BLUR_LIMIT,
        crops: layout.answerBoxes.map((box) => ({ no: box.no, dataUrl: grayToDataUrl(cropRegion(gray, h, box, CROP_PX_PER_MM)) })),
      };
      if (!qr) {
        update(key, { state: "needs_student", pending, text: `Bubbles read: ${pending.answers.map((a) => a ?? "-").join("")}` });
        return;
      }
      await upload(key, qr.studentId, true, pending);
    } catch (err) {
      update(key, { state: "error", error: err instanceof Error ? err.message : "Could not read this photo." });
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    // One at a time keeps memory low on older phones.
    for (const f of Array.from(files)) await processFile(f);
  };

  const done = new Set(results.filter((r) => r.state === "done").map((r) => r.studentId));
  const left = props.students.filter((s) => s.pending && !done.has(s.id)).length;

  return (
    <section className="card">
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn" onClick={() => camera.current?.click()}>Take photo</button>
        <button type="button" className="btn btn-ghost" onClick={() => gallery.current?.click()}>Choose photos</button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
      <p className="muted text-sm">{left === 0 ? "All papers scanned." : `${left} papers left to scan.`}</p>

      {results.map((r) => (
        <div key={r.key} className="row-box flex-col items-stretch">
          {r.state === "working" && <span className="muted">Reading…</span>}
          {r.state === "done" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><b>{nameOf(r.studentId!)}</b> · {r.text}</span>
              {r.flags && r.flags.length > 0 && <span className="pill pill-orange">{r.flags.map((f) => FLAG_LABEL[f] ?? f).join(", ")}</span>}
            </div>
          )}
          {r.state === "error" && <span style={{ color: "var(--red-ink)" }}>{r.error}</span>}
          {r.state === "needs_student" && r.pending && (
            <div className="flex flex-col gap-2">
              <span style={{ color: "var(--orange-ink)" }} className="font-extrabold">QR not readable. Whose paper is this?</span>
              <span className="muted font-mono text-xs">{r.text}</span>
              <select className="input" defaultValue="" onChange={async (e) => {
                const sid = e.target.value;
                if (!sid || !r.pending) return;
                const p = r.pending;
                update(r.key, { state: "working" });
                try { await upload(r.key, sid, false, p); } catch (err) { update(r.key, { state: "error", error: err instanceof Error ? err.message : "Upload failed" }); }
              }}>
                <option value="">Choose student…</option>
                {props.students.map((s) => <option key={s.id} value={s.id}>{s.roll} · {s.name}</option>)}
              </select>
            </div>
          )}
        </div>
      ))}
      {results.some((r) => r.state === "done") && (
        <Link href={`/teacher/paper-check/${props.testId}?tab=review`} className="btn">Done: check marks</Link>
      )}
    </section>
  );
}
