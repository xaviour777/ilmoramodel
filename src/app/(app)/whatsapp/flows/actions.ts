"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { TEMPLATES, TRIGGERS, runFlows, type FlowEdge, type FlowNode, type Trigger } from "@/lib/flows";
import { deliverQueued } from "@/lib/deliver";

async function gate() {
  const me = await requireRole("principal", "owner", "accountant");
  const sb = await createClient();
  const { data: on } = await sb.rpc("has_module", { p_module: "whatsapp" });
  if (!on) redirect("/whatsapp/flows?error=" + encodeURIComponent("The WhatsApp module isn't switched on for this school."));
  return { me, sb };
}

export async function createFlow(f: FormData) {
  const { sb } = await gate();
  const t = TEMPLATES[Number(f.get("template"))];
  const trigger = (t?.trigger ?? String(f.get("trigger") ?? "fee_due")) as Trigger;
  const { data, error } = await sb.from("wa_flows").insert({
    name: t?.name ?? (String(f.get("name") ?? "").trim() || TRIGGERS[trigger].label),
    trigger, nodes: t?.nodes ?? [{ id: "t", type: "trigger", x: 40, y: 40, data: {} }], edges: t?.edges ?? [],
  }).select("id").maybeSingle();
  if (error || !data) redirect("/whatsapp/flows?error=" + encodeURIComponent(error?.message ?? "Could not create"));
  redirect(`/whatsapp/flows/${data!.id}`);
}

export async function saveFlow(id: string, name: string, nodes: FlowNode[], edges: FlowEdge[]) {
  const { sb } = await gate();
  if (!nodes.some((n) => n.type === "trigger")) return { error: "A flow needs its start block." };
  for (const n of nodes) if (n.type === "send" && !n.data.text.trim()) return { error: "A 'Send WhatsApp' block has no message." };
  const { error } = await sb.from("wa_flows").update({ name: name.trim() || "Flow", nodes, edges }).eq("id", id);
  revalidatePath(`/whatsapp/flows/${id}`);
  return { error: error?.message ?? null };
}

export async function toggleFlow(f: FormData) {
  const { sb } = await gate();
  const id = String(f.get("id"));
  await sb.from("wa_flows").update({ enabled: f.get("enabled") === "1" }).eq("id", id);
  revalidatePath("/whatsapp/flows");
  redirect(String(f.get("back") || "/whatsapp/flows"));
}

export async function deleteFlow(f: FormData) {
  const { sb } = await gate();
  await sb.from("wa_flows").delete().eq("id", String(f.get("id")));
  redirect("/whatsapp/flows?saved=1");
}

// Runs the flows now (the daily job does the same) and sends what is waiting.
export async function runNow(f: FormData) {
  const { me, sb } = await gate();
  const id = String(f.get("id") ?? "") || undefined;
  const r = await runFlows(sb, me.campus_id, me.campus_name, id);
  const d = await deliverQueued(sb);
  const back = String(f.get("back") || "/whatsapp/flows");
  revalidatePath(back);
  redirect(`${back}?ran=${r.started}-${r.queued}-${d.sent}-${d.left}`);
}
