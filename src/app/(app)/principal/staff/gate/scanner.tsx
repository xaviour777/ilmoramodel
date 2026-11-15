"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { scanBadge, type GateResult } from "./actions";

type Shown = GateResult & { key: number };

// The gate phone: the camera reads staff QR codes (card or phone screen) and checks them in or out.
export function GateScanner() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [camera, setCamera] = useState<"off" | "on" | "denied">("off");
  const [shown, setShown] = useState<Shown | null>(null);
  const [log, setLog] = useState<Shown[]>([]);
  const [busy, setBusy] = useState(false);
  const recent = useRef(new Map<string, number>());

  async function submit(code: string) {
    const last = recent.current.get(code);
    if (last && Date.now() - last < 8000) return; // the same card held in front of the camera
    recent.current.set(code, Date.now());
    setBusy(true);
    const res = await scanBadge(code).catch(() => ({ ok: false, error: "No internet. Try again." }) as GateResult);
    setBusy(false);
    const s = { ...res, key: Date.now() } as Shown;
    setShown(s);
    if (res.ok) setLog((l) => [s, ...l].slice(0, 20));
    if ("vibrate" in navigator) navigator.vibrate(res.ok ? 80 : [60, 60, 60]);
  }

  useEffect(() => {
    if (camera !== "on") return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      } catch {
        setCamera("denied");
        return;
      }
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      timer = setInterval(() => {
        const c = canvas.current;
        if (!c || v.readyState < 2) return;
        const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * 480) || 360;
        c.width = w; c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        if (code?.data) void submit(code.data);
      }, 300);
    })();
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera]);

  const t = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" }) : "");
  const message = (r: Shown) => !r.ok ? r.error
    : r.action === "in" ? `${r.status === "late" ? "Late" : "On time"} · checked in ${t(r.at)}`
    : r.action === "out" ? `Checked out ${t(r.at)} · came at ${t(r.in_at)}`
    : `Already checked in at ${t(r.at)}${r.out_at ? `, out ${t(r.out_at)}` : ""}`;
  const tone = (r: Shown) => !r.ok ? "bg-error text-on-error" : r.action === "in" && r.status === "late" ? "bg-tertiary-fixed text-primary" : r.action === "already" ? "bg-surface-variant text-primary" : "bg-secondary text-on-secondary";

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-2xl bg-primary">
        <video ref={video} playsInline muted className={`aspect-[4/3] w-full object-cover ${camera === "on" ? "" : "hidden"}`} />
        <canvas ref={canvas} className="hidden" />
        {camera !== "on" && (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 p-6 text-center text-on-primary">
            <span className="msym text-[48px]" aria-hidden="true">qr_code_scanner</span>
            <p>{camera === "denied" ? "The camera is blocked. Allow the camera for this site in the browser settings, or type the code below." : "Keep this phone at the gate. Staff show the QR on their card or phone."}</p>
            <button type="button" className="btn !bg-secondary-fixed !text-primary" onClick={() => setCamera("on")}>Start camera</button>
          </div>
        )}
        {camera === "on" && <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-secondary-fixed/80" />}
        {busy && <div className="absolute inset-x-0 top-0 bg-primary/70 py-1 text-center text-label-md text-on-primary">Checking…</div>}
      </div>

      {shown && (
        <div key={shown.key} role="status" className={`rounded-2xl p-4 ${tone(shown)}`}>
          <div className="text-headline-sm font-extrabold">{shown.ok ? shown.name : "Not checked in"}</div>
          <div className="text-title-md">{message(shown)}</div>
        </div>
      )}

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const c = String(f.get("code") ?? ""); recent.current.delete(c); void submit(c); e.currentTarget.reset(); }}>
        <input className="input min-w-0 flex-1" name="code" placeholder="Or type the code under the QR" autoComplete="off" aria-label="Card code" />
        <button className="btn-ghost" type="submit">Check</button>
      </form>

      {log.length > 0 && (
        <section className="card flex flex-col gap-2">
          <h2 className="h2">On this phone today</h2>
          <ul className="divide-y divide-surface-variant">
            {log.map((r) => r.ok && (
              <li key={r.key} className="flex justify-between gap-2 py-1.5 text-body-md">
                <span className="font-semibold">{r.name}</span>
                <span className="text-on-surface-variant">{r.action === "out" ? "out" : r.action === "in" ? (r.status === "late" ? "late" : "in") : "again"} {t(r.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
