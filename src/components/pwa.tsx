"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// The browser offers installing only once per page load, often before the More sheet is open,
// so the offer is kept here for the button to use later.
let saved: InstallEvent | null = null;
const CHANGED = "ilmora-install-changed";

// Registers the service worker once (so phones offer "Install app") and keeps the install offer.
export function RegisterSW() {
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); saved = e as InstallEvent; window.dispatchEvent(new Event(CHANGED)); };
    const onInstalled = () => { saved = null; window.dispatchEvent(new Event(CHANGED)); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

// Shows "Install app" only when the browser can install Ilmora and it isn't installed yet.
export function InstallAppButton({ className, iconClass = "msym text-[20px]" }: { className?: string; iconClass?: string }) {
  const [evt, setEvt] = useState<InstallEvent | null>(saved);
  useEffect(() => {
    const sync = () => setEvt(saved);
    window.addEventListener(CHANGED, sync);
    return () => window.removeEventListener(CHANGED, sync);
  }, []);
  if (!evt) return null;
  return (
    <button type="button" className={className} onClick={async () => {
      await evt.prompt();
      await evt.userChoice;
      saved = null;
      setEvt(null);
    }}>
      <span className={iconClass} aria-hidden="true">install_mobile</span>Install app
    </button>
  );
}
