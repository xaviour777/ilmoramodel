"use client";

import { useEffect, useState } from "react";
import { savePushDevice } from "@/app/push-actions";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const b64 = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };

// "Turn on phone alerts": asks permission, subscribes this device and saves it.
export function PushToggle() {
  const [state, setState] = useState<"off" | "on" | "na" | "busy">("na");
  useEffect(() => {
    if (!KEY || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off")).catch(() => {});
  }, []);
  if (state === "na" || state === "on") return state === "on" ? <span className="muted text-xs font-bold">🔔 Alerts on</span> : null;
  async function turnOn() {
    setState("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") { setState("off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(KEY!) });
      const r = await savePushDevice(sub.toJSON() as never);
      setState(r.error ? "off" : "on");
    } catch { setState("off"); }
  }
  return <button type="button" onClick={turnOn} disabled={state === "busy"} className="chip text-sm font-black">🔔 Turn on phone alerts</button>;
}
