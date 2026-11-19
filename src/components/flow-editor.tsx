"use client";

import { useRef, useState } from "react";
import { CONDS, TRIGGERS, VARS, type Cond, type FlowEdge, type FlowNode, type Trigger } from "@/lib/flows";
import { saveFlow } from "@/app/(app)/whatsapp/flows/actions";

const W = 230, H = 78;
const LOOK: Record<FlowNode["type"], { bg: string; ring: string; icon: string; title: string }> = {
  trigger: { bg: "#dcfce7", ring: "#16a34a", icon: "▶", title: "Start" },
  wait: { bg: "#fef3c7", ring: "#f59e0b", icon: "⏱", title: "Wait" },
  check: { bg: "#ede9fe", ring: "#7c3aed", icon: "?", title: "Check" },
  send: { bg: "#e0f2fe", ring: "#0284c7", icon: "✉", title: "Send WhatsApp" },
  end: { bg: "#f1f5f9", ring: "#64748b", icon: "■", title: "End" },
};
const uid = () => Math.random().toString(36).slice(2, 8);

function summary(n: FlowNode, trigger: Trigger) {
  if (n.type === "trigger") return TRIGGERS[trigger].label;
  if (n.type === "wait") return n.data.mode === "due" ? (n.data.days === 0 ? "until the due date" : `until ${Math.abs(n.data.days)} day${Math.abs(n.data.days) === 1 ? "" : "s"} ${n.data.days < 0 ? "before" : "after"} due date`) : `${n.data.days} day${n.data.days === 1 ? "" : "s"}`;
  if (n.type === "check") return CONDS[n.data.cond];
  if (n.type === "send") return n.data.text.slice(0, 60) + (n.data.text.length > 60 ? "…" : "");
  return "Stop here";
}

// Drag-and-drop canvas: drag blocks by their header, click a block's ● and then another block to connect.
export function FlowEditor({ id, name: name0, trigger, initialNodes, initialEdges }: { id: string; name: string; trigger: Trigger; initialNodes: FlowNode[]; initialEdges: FlowEdge[] }) {
  const [name, setName] = useState(name0);
  const [nodes, setNodes] = useState<FlowNode[]>(initialNodes);
  const [edges, setEdges] = useState<FlowEdge[]>(initialEdges);
  const [sel, setSel] = useState<string | null>(null);
  const [link, setLink] = useState<{ from: string; branch?: "yes" | "no" } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const node = nodes.find((n) => n.id === sel);
  const dueOk = !!TRIGGERS[trigger].due || trigger === "homework";

  const add = (type: FlowNode["type"]) => {
    const y = Math.max(40, ...nodes.map((n) => n.y)) + 120;
    const data = type === "wait" ? { mode: "days", days: 1 } : type === "check" ? { cond: (trigger === "fee_due" ? "unpaid" : trigger === "homework" ? "not_submitted" : "still_absent") as Cond } : type === "send" ? { text: "Assalam-o-Alaikum {parent}. " } : {};
    const n = { id: uid(), type, x: 40, y, data } as FlowNode;
    setNodes([...nodes, n]);
    // join it after the selected block (or the last one) so simple flows build themselves
    const after = sel ?? [...nodes].sort((a, b) => b.y - a.y)[0]?.id;
    if (after && !edges.some((e) => e.from === after && !e.branch) && nodes.find((x) => x.id === after)?.type !== "check" && nodes.find((x) => x.id === after)?.type !== "end") setEdges([...edges, { from: after, to: n.id }]);
    setSel(n.id);
  };
  const patch = (d: Record<string, unknown>) => setNodes(nodes.map((n) => (n.id === sel ? ({ ...n, data: { ...n.data, ...d } } as FlowNode) : n)));
  const remove = () => { if (!node || node.type === "trigger") return; setNodes(nodes.filter((n) => n.id !== sel)); setEdges(edges.filter((e) => e.from !== sel && e.to !== sel)); setSel(null); };
  const connect = (to: string) => {
    if (!link || link.from === to) return setLink(null);
    setEdges([...edges.filter((e) => !(e.from === link.from && e.branch === link.branch)), { from: link.from, to, ...(link.branch ? { branch: link.branch } : {}) }]);
    setLink(null);
  };
  const save = async () => { setBusy(true); const r = await saveFlow(id, name, nodes, edges); setBusy(false); setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: "Saved." }); };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = Math.max(0, Math.round((e.clientX - r.left + box.current.scrollLeft - drag.current.dx) / 10) * 10);
    const y = Math.max(0, Math.round((e.clientY - r.top + box.current.scrollTop - drag.current.dy) / 10) * 10);
    setNodes((ns) => ns.map((n) => (n.id === drag.current!.id ? { ...n, x, y } : n)));
  };
  const hgt = Math.max(500, ...nodes.map((n) => n.y + H + 80)), wid = Math.max(700, ...nodes.map((n) => n.x + W + 80));
  const pos = (id: string) => nodes.find((n) => n.id === id);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <section className="card gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input min-w-0 flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="Flow name" />
          <button className="btn" type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save flow"}</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["wait", "check", "send", "end"] as const).map((t) => <button key={t} type="button" onClick={() => add(t)} className="rounded-xl border-2 px-3 py-1.5 text-sm font-black" style={{ background: LOOK[t].bg, borderColor: LOOK[t].ring }}>+ {LOOK[t].title}</button>)}
          {link && <span className="pill pill-orange">Now click the block to connect to{link.branch ? ` (${link.branch})` : ""} · <button type="button" className="underline" onClick={() => setLink(null)}>cancel</button></span>}
        </div>
        {msg && <div className={msg.ok ? "notice-ok" : "notice-bad"}>{msg.t}</div>}
        <div ref={box} className="relative overflow-auto rounded-2xl border-2" style={{ height: 560, borderColor: "#e5e7eb", backgroundImage: "radial-gradient(#e5e7eb 1px, transparent 1px)", backgroundSize: "20px 20px" }}
          onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
          <svg width={wid} height={hgt} className="pointer-events-none absolute left-0 top-0">
            <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#94a3b8" /></marker></defs>
            {edges.map((e, i) => {
              const a = pos(e.from), b = pos(e.to);
              if (!a || !b) return null;
              const x1 = a.x + (e.branch === "no" ? W - 30 : e.branch === "yes" ? 30 : W / 2), y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y;
              const my = (y1 + y2) / 2;
              return (
                <g key={i}>
                  <path d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2 - 4}`} fill="none" stroke={e.branch === "no" ? "#ef4444" : e.branch === "yes" ? "#16a34a" : "#94a3b8"} strokeWidth="2.5" markerEnd="url(#arr)" />
                  {e.branch && <text x={(x1 + x2) / 2 + 4} y={my} fontSize="11" fontWeight="900" fill={e.branch === "no" ? "#b91c1c" : "#15803d"}>{e.branch.toUpperCase()}</text>}
                </g>
              );
            })}
          </svg>
          <div style={{ width: wid, height: hgt }} />
          {nodes.map((n) => {
            const L = LOOK[n.type];
            return (
              <div key={n.id} className="absolute select-none rounded-2xl border-2 bg-white shadow-sm" onClick={() => (link ? connect(n.id) : setSel(n.id))}
                style={{ left: n.x, top: n.y, width: W, height: H, borderColor: sel === n.id ? "#0f172a" : L.ring, cursor: link ? "crosshair" : "default" }}>
                <div className="flex cursor-grab items-center gap-1.5 rounded-t-[14px] px-2.5 py-1 text-[12px] font-black" style={{ background: L.bg, touchAction: "none" }}
                  onPointerDown={(e) => { const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(); drag.current = { id: n.id, dx: e.clientX - r.left, dy: e.clientY - r.top }; setSel(n.id); }}>
                  <span>{L.icon}</span><span className="flex-1">{L.title}</span>
                </div>
                <div className="line-clamp-2 px-2.5 py-1 text-[12px] font-bold text-[#374151]">{summary(n, trigger)}</div>
                {n.type === "check" ? (
                  <>
                    <button type="button" title="Connect YES" onClick={(e) => { e.stopPropagation(); setLink({ from: n.id, branch: "yes" }); }} className="absolute -bottom-2.5 left-5 h-5 w-5 rounded-full border-2 border-white bg-[#16a34a] text-[9px] font-black text-white">Y</button>
                    <button type="button" title="Connect NO" onClick={(e) => { e.stopPropagation(); setLink({ from: n.id, branch: "no" }); }} className="absolute -bottom-2.5 right-5 h-5 w-5 rounded-full border-2 border-white bg-[#ef4444] text-[9px] font-black text-white">N</button>
                  </>
                ) : n.type !== "end" && (
                  <button type="button" title="Connect to the next block" onClick={(e) => { e.stopPropagation(); setLink({ from: n.id }); }} className="absolute -bottom-2.5 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-white bg-[#0f172a]" />
                )}
              </div>
            );
          })}
        </div>
        <p className="muted text-xs">Drag a block by its coloured top. Click the dot under a block, then click the next block to join them. A Check block has a green YES and a red NO dot.</p>
      </section>

      <section className="card">
        {!node ? <><h2 className="h2">Pick a block</h2><p className="muted text-sm">Click any block on the canvas to change it. Add blocks with the buttons above the canvas.</p>
          <div className="muted text-xs"><b>You can put these in a message:</b> {VARS.join(" ")}</div></> : (
          <>
            <h2 className="h2">{LOOK[node.type].icon} {LOOK[node.type].title}</h2>
            {node.type === "trigger" && <p className="text-sm font-bold">{TRIGGERS[trigger].label}. {TRIGGERS[trigger].hint}</p>}
            {node.type === "wait" && (
              <>
                <label className="field">Wait
                  <select className="input" value={node.data.mode} onChange={(e) => patch({ mode: e.target.value })}>
                    <option value="days">a number of days</option>
                    {dueOk && <option value="due">until a day around the due date</option>}
                  </select></label>
                <label className="field">{node.data.mode === "due" ? "Days from the due date (−3 = 3 days before, 7 = a week after)" : "Days"}
                  <input className="input" type="number" min={node.data.mode === "due" ? -60 : 0} max={90} value={node.data.days} onChange={(e) => patch({ days: Number(e.target.value) })} /></label>
              </>
            )}
            {node.type === "check" && (
              <label className="field">Question
                <select className="input" value={node.data.cond} onChange={(e) => patch({ cond: e.target.value })}>
                  {Object.entries(CONDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
            )}
            {node.type === "send" && (
              <>
                <label className="field">Message<textarea className="input min-h-40 py-2" value={node.data.text} onChange={(e) => patch({ text: e.target.value })} /></label>
                <div className="flex flex-wrap gap-1">{VARS.map((v) => <button key={v} type="button" className="tagx" onClick={() => patch({ text: node.data.text + v })}>{v}</button>)}</div>
                <p className="muted text-xs">Goes to the family&apos;s WhatsApp number, from one of your linked numbers.</p>
              </>
            )}
            {node.type !== "trigger" && <button type="button" className="btn-ghost self-start" onClick={remove}>Delete block</button>}
            <div className="muted text-xs">Connections from this block: {edges.filter((e) => e.from === node.id).map((e) => `${e.branch ? e.branch + " → " : "→ "}${LOOK[pos(e.to)?.type ?? "end"].title}`).join(", ") || "none"}
              {edges.some((e) => e.from === node.id) && <> · <button type="button" className="underline" onClick={() => setEdges(edges.filter((e) => e.from !== node.id))}>clear</button></>}</div>
          </>
        )}
      </section>
    </div>
  );
}
