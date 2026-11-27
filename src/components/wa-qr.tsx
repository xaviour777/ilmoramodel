"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { qrStatus } from "@/app/(app)/whatsapp/actions";

// Shows the number's QR and refreshes it until the phone scans it.
export function WaQr({ id }: { id: string }) {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [msg, setMsg] = useState("Loading QR…");
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const r = await qrStatus(id);
      if (stop) return;
      if (r.state === "connected") { setMsg("Connected!"); router.refresh(); return; }
      if (r.state === "error") setMsg(r.error ?? "Could not reach the WhatsApp server.");
      else { setQr(r.qr); setMsg(r.qr ? "Scan with WhatsApp on the phone: Settings → Linked devices → Link a device." : "Waiting for a QR…"); }
      setTimeout(tick, 5000);
    };
    tick();
    return () => { stop = true; };
  }, [id, router]);
  return (
    <div className="flex flex-col items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr ? <img src={qr} alt="WhatsApp QR code" className="h-56 w-56 rounded-xl border-2" style={{ borderColor: "#e5e7eb" }} /> : <div className="h-56 w-56 animate-pulse rounded-xl bg-[#f1f5f9]" />}
      <p className="muted text-center text-sm font-bold">{msg}</p>
    </div>
  );
}
