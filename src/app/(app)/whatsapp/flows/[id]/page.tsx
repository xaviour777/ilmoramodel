import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { TRIGGERS, type FlowEdge, type FlowNode, type Trigger } from "@/lib/flows";
import { FlowEditor } from "@/components/flow-editor";
import { deleteFlow, runNow, toggleFlow } from "../actions";

export default async function EditFlow({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ran?: string }> }) {
  await requireRole("principal", "owner", "accountant");
  const { id } = await params;
  const sp = await searchParams;
  const sb = await createClient();
  const [{ data: f }, { data: runs }] = await Promise.all([
    sb.from("wa_flows").select("*").eq("id", id).maybeSingle(),
    sb.from("wa_flow_runs").select("id, ref, status, next_at, log, families(name)").eq("flow_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (!f) notFound();
  const back = `/whatsapp/flows/${id}`;
  const ran = sp.ran?.split("-").map(Number);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><Link href="/whatsapp/flows" className="eyebrow">‹ Auto flows</Link><h1 className="h1">{f.name}</h1><p className="muted text-base">Starts when: {TRIGGERS[f.trigger as Trigger].label}. {TRIGGERS[f.trigger as Trigger].hint}</p></div>
        <div className="flex flex-wrap gap-2">
          <form action={toggleFlow}><input type="hidden" name="id" value={id} /><input type="hidden" name="enabled" value={f.enabled ? "0" : "1"} /><input type="hidden" name="back" value={back} />
            <button className={f.enabled ? "btn-ghost" : "btn"} type="submit">{f.enabled ? "Switch off" : "Switch on"}</button></form>
          <form action={runNow}><input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={back} /><button className="btn-ghost" type="submit" disabled={!f.enabled}>Run now</button></form>
          <form action={deleteFlow}><input type="hidden" name="id" value={id} /><button className="btn-ghost" type="submit">Delete</button></form>
        </div>
      </div>
      {ran && <div className="notice-ok">{ran[0]} new started, {ran[1]} messages queued, {ran[2]} sent{ran[3] ? `, ${ran[3]} waiting` : ""}.</div>}
      <FlowEditor id={id} name={f.name} trigger={f.trigger as Trigger} initialNodes={f.nodes as FlowNode[]} initialEdges={f.edges as FlowEdge[]} />
      <section className="card">
        <h2 className="h2">Recent runs</h2>
        {(runs ?? []).length === 0 && <p className="muted">None yet. Switch the flow on and press Run now.</p>}
        {((runs ?? []) as unknown as { id: string; ref: string; status: string; next_at: string; log: { note: string }[]; families: { name: string } | null }[]).map((r) => (
          <div key={r.id} className="flex flex-wrap justify-between gap-2 border-t-2 py-1.5 text-sm font-bold" style={{ borderColor: "#f1f5f9" }}>
            <span>{r.families?.name ?? r.ref}</span>
            <span className="muted text-xs">{r.log.at(-1)?.note}</span>
            <span className={`pill ${r.status === "done" ? "pill-green" : "pill-blue"}`}>{r.status === "waiting" ? `next ${new Date(r.next_at).toLocaleDateString("en-GB")}` : r.status}</span>
          </div>
        ))}
      </section>
    </>
  );
}
