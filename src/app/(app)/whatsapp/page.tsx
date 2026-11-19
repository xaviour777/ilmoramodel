import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { evoReady } from "@/lib/evolution";
import { todayPK, shortDate } from "@/lib/format";
import { WaTabs } from "@/components/wa-tabs";
import { WaQr } from "@/components/wa-qr";
import { ModuleOff } from "@/components/wa-tabs";
import { addNumber, refreshNumbers, relink, removeNumber, saveNumber } from "./actions";

const PILL: Record<string, [string, string]> = { new: ["New", "pill-gray"], qr: ["Scan QR", "pill-orange"], connected: ["Connected", "pill-green"], disconnected: ["Disconnected", "pill-red"], banned: ["Blocked by WhatsApp", "pill-red"] };

export default async function WhatsAppNumbers({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("principal", "owner", "accountant");
  const sp = await searchParams;
  const sb = await createClient();
  const { data: on } = await sb.rpc("has_module", { p_module: "whatsapp" });
  const { data: nums } = await sb.from("wa_numbers").select("*").order("created_at");
  const today = todayPK();
  const live = (nums ?? []).filter((n) => n.status === "connected");
  const cap = live.reduce((t, n) => t + n.daily_limit, 0);
  const used = live.reduce((t, n) => t + (n.sent_on === today ? n.sent_today : 0), 0);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="kick">WhatsApp module</div><h1 className="h1">WhatsApp numbers</h1><p className="muted text-base">Your own numbers, linked by QR. Messages are shared across them.</p></div>
        <WaTabs current="numbers" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}{sp.saved && <div className="notice-ok">Saved.</div>}
      {!on ? <ModuleOff /> : (
        <>
          {!evoReady() && <div className="notice-bad">The WhatsApp server isn&apos;t connected yet. Set EVOLUTION_URL and EVOLUTION_KEY in Vercel (see the setup guide in docs/whatsapp-setup.md).</div>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="tile"><span className="muted">Connected</span><b>{live.length}</b></div>
            <div className="tile"><span className="muted">Sent today</span><b>{used}</b></div>
            <div className="tile"><span className="muted">Left today</span><b>{Math.max(0, cap - used)}</b></div>
            <div className="tile"><span className="muted">Need attention</span><b style={{ color: (nums ?? []).some((n) => ["disconnected", "banned"].includes(n.status)) ? "var(--red-ink)" : undefined }}>{(nums ?? []).filter((n) => ["disconnected", "banned"].includes(n.status)).length}</b></div>
          </div>
          <div className="grid gap-5 xl:grid-cols-[360px_1fr] xl:items-start">
            <form action={addNumber} className="card">
              <h2 className="h2">Add a number</h2>
              <label className="field">Name<input className="input" name="label" placeholder="Office phone 1" required /></label>
              <label className="field">Messages per day<input className="input" type="number" name="limit" defaultValue={150} min={1} max={1000} /></label>
              <button className="btn self-start" type="submit" disabled={!evoReady()}>Add and show QR</button>
              <div className="muted text-xs">
                <b>To keep numbers safe:</b> use numbers that are a few months old and in normal use, keep 150 a day or less on each,
                ask parents to save the school&apos;s number, and send only to families who gave you their number. WhatsApp can still block
                numbers that send a lot; if one is blocked, the others carry on.
              </div>
            </form>
            <section className="card">
              <div className="flex items-center justify-between"><h2 className="h2">Numbers</h2><form action={refreshNumbers}><button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Check status</button></form></div>
              {(nums ?? []).length === 0 && <p className="muted">No numbers yet. Add one and scan its QR from the phone.</p>}
              {(nums ?? []).map((n) => (
                <div key={n.id} className="flex flex-col gap-2 border-t-2 py-3" style={{ borderColor: "#f1f5f9" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="flex-1">{n.label}{n.phone ? ` · +${n.phone}` : ""}</b>
                    <span className={`pill ${PILL[n.status][1]}`}>{PILL[n.status][0]}</span>
                  </div>
                  <div className="muted text-xs">{n.sent_on === today ? n.sent_today : 0} of {n.daily_limit} sent today{n.last_used_at ? ` · last used ${shortDate(n.last_used_at)}` : ""}{n.last_error ? ` · ${n.last_error}` : ""}</div>
                  {n.status === "qr" && evoReady() && <WaQr id={n.id} />}
                  <div className="flex flex-wrap gap-2">
                    <form action={saveNumber} className="flex gap-2"><input type="hidden" name="id" value={n.id} />
                      <input className="input w-40" name="label" defaultValue={n.label} /><input className="input w-24" type="number" name="limit" defaultValue={n.daily_limit} />
                      <button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Save</button></form>
                    {n.status !== "connected" && n.status !== "qr" && <form action={relink}><input type="hidden" name="id" value={n.id} /><button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Link again</button></form>}
                    <form action={removeNumber}><input type="hidden" name="id" value={n.id} /><button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Remove</button></form>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </>
  );
}
