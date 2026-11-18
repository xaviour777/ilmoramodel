"use client";

import { useEffect, useState } from "react";

type Prompt = Event & { prompt: () => Promise<void> };

// Registers the service worker and offers "Install app" where the phone supports it.
export function Pwa() {
  const [ev, setEv] = useState<Prompt | null>(null);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const h = (e: Event) => { e.preventDefault(); setEv(e as Prompt); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (!ev) return null;
  return (
    <button type="button" onClick={() => { ev.prompt(); setEv(null); }}
      className="fixed bottom-24 right-4 z-40 rounded-2xl px-4 py-3 text-sm font-black text-white shadow-lg lg:bottom-6"
      style={{ background: "var(--brand, #16a34a)" }}>Install app on phone</button>
  );
}
