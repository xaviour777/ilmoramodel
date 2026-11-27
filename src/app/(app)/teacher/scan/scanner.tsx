"use client";

import { useEffect, useRef, useState } from "react";
import { markByCard } from "./actions";

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

// Camera QR scanner for student cards. Phones without the browser's QR reader can type the ID instead.
export function Scanner() {
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"present" | "late">("present");
  const [on, setOn] = useState(false);
  const [log, setLog] = useState<{ t: string; ok: boolean }[]>([]);
  const [supported, setSupported] = useState(true);
  const seen = useRef(new Map<string, number>());
  const modeRef = useRef(mode);
  modeRef.current = mode;

  async function handle(code: string) {
    const last = seen.current.get(code) ?? 0;
    if (Date.now() - last < 5000) return;
    seen.current.set(code, Date.now());
    const r = await markByCard(code, modeRef.current);
    setLog((l) => [{ t: r.error ?? `${r.name} · ${modeRef.current}`, ok: !r.error }, ...l].slice(0, 50));
    if (!r.error && "vibrate" in navigator) navigator.vibrate(80);
  }

  useEffect(() => {
    if (!on) return;
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!BD) { setSupported(false); setOn(false); return; }
    const det = new BD({ formats: ["qr_code"] });
    let stream: MediaStream | null = null, stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream; await video.current.play();
        while (!stop) {
          try { for (const c of await det.detect(video.current)) await handle(c.rawValue); } catch {}
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch { setLog((l) => [{ t: "Camera not allowed.", ok: false }, ...l]); setOn(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [on]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(["present", "late"] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={`pill ${mode === m ? "pill-blue" : "pill-gray"}`}>Mark {m}</button>)}
      </div>
      {supported ? (
        <>
          <video ref={video} playsInline muted className="aspect-square w-full max-w-sm rounded-2xl bg-black object-cover" style={{ display: on ? "block" : "none" }} />
          <button type="button" className="btn self-start" onClick={() => setOn(!on)}>{on ? "Stop camera" : "Start scanning"}</button>
        </>
      ) : <p className="notice-bad">This phone&apos;s browser can&apos;t read QR codes. Use Chrome on Android, or type the ID below.</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const v = (f.elements.namedItem("code") as HTMLInputElement).value; if (v) { seen.current.delete(v); handle(v); f.reset(); } }}>
        <input className="input flex-1" name="code" placeholder="Student ID, e.g. MS-0012" />
        <button className="btn-ghost" type="submit">Mark</button>
      </form>
      <div className="flex flex-col gap-1">{log.map((x, i) => <div key={i} className={x.ok ? "notice-ok" : "notice-bad"}>{x.t}</div>)}</div>
    </div>
  );
}
