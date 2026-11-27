"use client";

import { useCallback, useEffect, useState } from "react";
import { GUIDE_VIDEO, TOURS, type Step } from "@/lib/guide";

type Role = keyof typeof TOURS;
const KEY = (role: string) => `prinqo-guide-${role}`;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return "1"; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

// First visit: a welcome video, then a short tour that points at the real menu items.
// The ? button brings either back. Seen-state is kept on this device only.
export function Guide({ role }: { role: Role }) {
  const steps = TOURS[role] ?? [];
  const [mode, setMode] = useState<"off" | "video" | "tour" | "menu">("off");
  const [i, setI] = useState(0);

  useEffect(() => { if (!read(KEY(role))) setMode("video"); }, [role]);
  const done = useCallback(() => { write(KEY(role), "1"); setMode("off"); }, [role]);
  const startTour = () => { setI(0); setMode(steps.length ? "tour" : "off"); write(KEY(role), "1"); };

  return (
    <>
      <button type="button" data-guide-help onClick={() => setMode(mode === "menu" ? "off" : "menu")} aria-label="Help: video and tour"
        className="fixed bottom-24 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl font-black shadow-[0_6px_18px_rgba(0,0,0,.18)] ring-2 ring-[#e5e7eb] lg:bottom-6">?</button>
      {mode === "menu" && (
        <div className="fixed bottom-40 left-4 z-40 flex w-56 flex-col gap-1 rounded-2xl bg-white p-2 shadow-[0_10px_30px_rgba(0,0,0,.2)] ring-2 ring-[#e5e7eb] lg:bottom-20">
          <button className="rounded-xl px-3 py-2.5 text-left font-black hover:bg-[#f1f5f9]" onClick={() => setMode("video")}>▶ Watch the video</button>
          {steps.length > 0 && <button className="rounded-xl px-3 py-2.5 text-left font-black hover:bg-[#f1f5f9]" onClick={startTour}>➜ Take the tour</button>}
        </div>
      )}
      {mode === "video" && <Video onClose={done} onTour={steps.length ? startTour : undefined} />}
      {mode === "tour" && <Tour steps={steps} i={i} setI={setI} onClose={done} />}
    </>
  );
}

function Video({ onClose, onTour }: { onClose: () => void; onTour?: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,.6)] p-4" role="dialog" aria-modal="true" aria-label="Welcome video" onClick={onClose}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <b className="text-[17px]">Welcome! Watch this short guide</b>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-2xl font-black hover:bg-[#f1f5f9]">×</button>
        </div>
        <div className="relative aspect-video bg-black">
          <iframe className="absolute inset-0 h-full w-full" src={`https://www.youtube-nocookie.com/embed/${GUIDE_VIDEO}?rel=0`} title="Guide video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-4 py-3">
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
          {onTour && <button type="button" className="btn" onClick={onTour}>Show me around</button>}
        </div>
      </div>
    </div>
  );
}

// The first visible element for a step (sidebar on a laptop, bottom bar on a phone).
function find(sel?: string) {
  if (!sel) return null;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

function Tour({ steps, i, setI, onClose }: { steps: Step[]; i: number; setI: (n: number) => void; onClose: () => void }) {
  const step = steps[i];
  const [box, setBox] = useState<DOMRect | null>(null);

  useEffect(() => {
    const el = find(step?.sel);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const measure = () => setBox(find(step?.sel)?.getBoundingClientRect() ?? null);
    const t = setTimeout(measure, 250);
    measure();
    addEventListener("resize", measure); addEventListener("scroll", measure, true);
    return () => { clearTimeout(t); removeEventListener("resize", measure); removeEventListener("scroll", measure, true); };
  }, [step]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") { if (i < steps.length - 1) setI(i + 1); else onClose(); }
      if (e.key === "ArrowLeft" && i > 0) setI(i - 1);
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [i, steps.length, setI, onClose]);

  if (!step) return null;
  const pad = 6, W = 300;
  const vw = typeof window === "undefined" ? 1024 : innerWidth, vh = typeof window === "undefined" ? 768 : innerHeight;
  // the card sits beside the item when there is room, else below or above it, else in the middle
  let pos: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%,-50%)" };
  if (box) {
    if (box.right + 16 + W < vw) pos = { left: box.right + 16, top: Math.min(Math.max(12, box.top - 8), vh - 220) };
    else if (box.bottom + 210 < vh) pos = { left: Math.min(Math.max(12, box.left), vw - W - 12), top: box.bottom + 14 };
    else pos = { left: Math.min(Math.max(12, box.left), vw - W - 12), top: Math.max(12, box.top - 200) };
  }
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={step.title}>
      {box
        ? <div className="pointer-events-none fixed rounded-xl transition-all duration-200" style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2, boxShadow: "0 0 0 9999px rgba(15,23,42,.6), 0 0 0 3px #facc15" }} />
        : <div className="fixed inset-0 bg-[rgba(15,23,42,.6)]" />}
      <div className="fixed flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-[0_12px_36px_rgba(0,0,0,.25)]" style={{ width: Math.min(W, vw - 24), ...pos }}>
        <div className="text-[12px] font-black text-[#6b7280]">Step {i + 1} of {steps.length}</div>
        <b className="text-[17px]">{step.title}</b>
        <p className="text-[14px] text-[#374151]">{step.body}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <button type="button" className="text-[13px] font-extrabold text-[#6b7280] underline" onClick={onClose}>Skip</button>
          <div className="flex gap-2">
            {i > 0 && <button type="button" className="btn-ghost" style={{ minHeight: 38, padding: "0 12px" }} onClick={() => setI(i - 1)}>Back</button>}
            <button type="button" className="btn" style={{ minHeight: 38, padding: "0 14px" }} onClick={() => (i < steps.length - 1 ? setI(i + 1) : onClose())}>{i < steps.length - 1 ? "Next" : "Done"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
