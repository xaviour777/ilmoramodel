"use client";

import { useEffect, useState } from "react";
import { UR } from "@/lib/urdu";

// Parents get Urdu unless they chose English; students get English unless they chose Urdu.
const read = (urduFirst: boolean) => {
  try { const c = document.cookie; return c.includes("lang=ur") || (urduFirst && !c.includes("lang=en")); } catch { return urduFirst; }
};

// Swaps known English phrases on the family screens for Urdu, and keeps doing so as pages change.
export function UrduSwitch({ urduFirst = false }: { urduFirst?: boolean }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(read(urduFirst)), [urduFirst]);
  useEffect(() => {
    if (!on) return;
    const root = document.body;
    const swap = (n: Node) => {
      const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        const s = t.nodeValue?.trim();
        if (s && UR[s]) { t.nodeValue = t.nodeValue!.replace(s, UR[s]); (t.parentElement as HTMLElement | null)?.setAttribute("lang", "ur"); }
      }
    };
    swap(root);
    const mo = new MutationObserver((ms) => ms.forEach((m) => (m.type === "characterData" ? swap(m.target.parentNode ?? m.target) : m.addedNodes.forEach(swap))));
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [on]);
  const flip = () => { document.cookie = `lang=${on ? "en" : "ur"}; path=/; max-age=31536000`; location.reload(); };
  return <button type="button" onClick={flip} className="chip text-sm font-black">{on ? "English" : "اردو"}</button>;
}
