import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATES, TRIGGERS, type Trigger } from "@/lib/flows";
import { ModuleOff, WaTabs } from "@/components/wa-tabs";
import { createFlow, runNow, toggleFlow } from "./actions";

export default async function Flows({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; ran?: string }> }) {
  await requireRole("principal", "owner", "accountant");
  const sp = await searchParams;
  const sb = await createClient();
  const { data: on } = await sb.rpc("has_module", { p_module: "whatsapp" });
  const [{ data: flows }, { data: runs }] = await Promise.all([
    sb.from("wa_flows").select("id, name, trigger, enabled, last_run_at, nodes").order("created_at"),
    sb.from("wa_flow_runs").select("flow_id, status"),
  ]);
  const ran = sp.ran?.split("-").map(Number);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="kick">Messages</div><h1 className="h1">Auto flows</h1><p className="muted text-base">Decide which message goes when: fee reminders before and after the due date, absences, results, birthdays.</p></div>
        <WaTabs current="flows" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}{sp.saved && <div className="notice-ok">Saved.</div>}
      {ran && <div className="notice-ok">Ran the flows: {ran[0]} new started, {ran[1]} messages queued, {ran[2]} sent now{ran[3] ? `, ${ran[3]} still waiting to go` : ""}.</div>}
      {!on ? <ModuleOff /> : (
        <>
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Your flows</h2>
              <form action={runNow}><button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Run all now</button></form></div>
            {(flows ?? []).length === 0 && <p className="muted">No flows yet. Start from a ready-made one below.</p>}
            {(flows ?? []).map((f) => {
              const r = (runs ?? []).filter((x) => x.flow_id === f.id);
              return (
                <div key={f.id} className="flex flex-wrap items-center gap-2 border-t-2 py-2.5" style={{ borderColor: "#f1f5f9" }}>
                  <div className="min-w-48 flex-1"><Link href={`/whatsapp/flows/${f.id}`} className="font-black underline-offset-2 hover:underline">{f.name}</Link>
                    <div className="muted text-xs">{TRIGGERS[f.trigger as Trigger].label} · {(f.nodes as unknown[]).length} blocks · {r.filter((x) => x.status === "waiting").length} in progress, {r.filter((x) => x.status === "done").length} finished{f.last_run_at ? ` · last run ${new Date(f.last_run_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</div></div>
                  <form action={toggleFlow}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="enabled" value={f.enabled ? "0" : "1"} />
                    <button className={`pill ${f.enabled ? "pill-green" : "pill-gray"}`} type="submit">{f.enabled ? "On" : "Off"}</button></form>
                  <Link className="btn-ghost min-h-10 px-3 text-sm" href={`/whatsapp/flows/${f.id}`}>Edit</Link>
                </div>
              );
            })}
          </section>
          <section className="card">
            <h2 className="h2">Start from a ready-made flow</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {TEMPLATES.map((t, i) => (
                <form key={t.name} action={createFlow} className="flex items-center gap-3 rounded-2xl border-2 p-3" style={{ borderColor: "#e5e7eb" }}>
                  <input type="hidden" name="template" value={i} />
                  <div className="flex-1"><div className="font-black">{t.name}</div><div className="muted text-xs">{TRIGGERS[t.trigger].label} · {t.nodes.filter((n) => n.type === "send").length} messages</div></div>
                  <button className="btn min-h-10 px-3 text-sm" type="submit">Use</button>
                </form>
              ))}
            </div>
            <form action={createFlow} className="flex flex-wrap items-end gap-2 border-t-2 pt-3" style={{ borderColor: "#f1f5f9" }}>
              <input type="hidden" name="template" value="-1" />
              <label className="field">Or start empty: when<select className="input" name="trigger">{Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
              <label className="field">Name<input className="input" name="name" placeholder="My flow" /></label>
              <button className="btn-ghost" type="submit">Create</button>
            </form>
          </section>
          <p className="muted text-xs">Flows run every morning by themselves, and whenever you press &quot;Run all now&quot;. A flow starts once per family and event, so nobody gets the same message twice.</p>
        </>
      )}
    </>
  );
}
