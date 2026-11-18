"use client";

import { useState } from "react";
import { startJazzCash } from "@/app/pay-actions";

// Sends the parent to JazzCash's secure page with a signed form; they come back to Fees.
export function JazzPay({ invoiceId, amountPaisa, sandbox }: { invoiceId: string | null; amountPaisa: number; sandbox: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true); setErr(null);
    const r = await startJazzCash(invoiceId, amountPaisa);
    if (!("url" in r) || !r.url) { setErr(r.error ?? "Could not start."); setBusy(false); return; }
    const form = document.createElement("form");
    form.method = "POST"; form.action = r.url;
    for (const [k, v] of Object.entries(r.fields!)) { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; form.appendChild(i); }
    document.body.appendChild(form); form.submit();
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn self-start" disabled={busy} onClick={go}>{busy ? "Opening JazzCash…" : `Pay Rs ${Math.round(amountPaisa / 100).toLocaleString("en-PK")} online`}</button>
      {sandbox && <span className="muted text-xs">Test mode: no real money moves.</span>}
      {err && <div className="notice-bad">{err}</div>}
    </div>
  );
}
