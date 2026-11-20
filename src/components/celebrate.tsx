"use client";

import { useEffect, useState } from "react";

// A small, one-time "well done" for a real milestone (a teacher-approved achievement or a goal reached).
// Each one shows once on this phone; there are no streaks or points to chase.
export function Celebrate({ items, ur }: { items: { key: string; text: string }[]; ur: boolean }) {
  const [show, setShow] = useState<{ key: string; text: string }[]>([]);
  useEffect(() => {
    try {
      const seen = new Set<string>(JSON.parse(localStorage.getItem("ilm-celebrated") ?? "[]"));
      setShow(items.filter((i) => !seen.has(i.key)).slice(0, 2));
    } catch { setShow([]); }
  }, [items]);
  if (!show.length) return null;
  const close = () => {
    try {
      const seen = new Set<string>(JSON.parse(localStorage.getItem("ilm-celebrated") ?? "[]"));
      show.forEach((s) => seen.add(s.key));
      localStorage.setItem("ilm-celebrated", JSON.stringify([...seen].slice(-200)));
    } catch { /* private mode: it just shows again next time */ }
    setShow([]);
  };
  return (
    <div role="status" className="celebrate relative overflow-hidden rounded-2xl border-2 p-4" style={{ borderColor: "#fcd34d", background: "#fffbeb" }} dir={ur ? "rtl" : "ltr"}>
      <style>{`.celebrate .bit{position:absolute;top:-10px;font-size:18px;animation:fall 2.4s ease-in forwards}@keyframes fall{to{transform:translateY(120px) rotate(200deg);opacity:0}}@media (prefers-reduced-motion: reduce){.celebrate .bit{display:none}}`}</style>
      {["🎉", "⭐", "🎊", "✨", "🎉"].map((b, i) => <span key={i} className="bit" aria-hidden style={{ left: `${10 + i * 20}%`, animationDelay: `${i * 0.15}s` }}>{b}</span>)}
      <div className="text-lg font-black">{ur ? "شاباش!" : "Well done!"}</div>
      {show.map((s) => <div key={s.key} className="font-bold">{s.text}</div>)}
      <button type="button" onClick={close} className="btn-ghost mt-2 min-h-9 px-3 text-xs">{ur ? "شکریہ" : "Thanks"}</button>
    </div>
  );
}
