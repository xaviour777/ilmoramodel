// Evolution API (open source, github.com/EvolutionAPI/evolution-api): links ordinary WhatsApp
// numbers by QR scan, like WhatsApp Web. Runs on the school's own small server.
// Env: EVOLUTION_URL (e.g. https://wa.myschool.pk) and EVOLUTION_KEY (its global API key).
export const evoReady = () => !!(process.env.EVOLUTION_URL && process.env.EVOLUTION_KEY);

async function evo<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(process.env.EVOLUTION_URL!.replace(/\/$/, "") + path, {
    method: init?.method ?? "GET",
    headers: { apikey: process.env.EVOLUTION_KEY!, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error((j as { response?: { message?: string[] }; message?: string } | null)?.response?.message?.join(", ") ?? (j as { message?: string } | null)?.message ?? `WhatsApp server said ${res.status}`);
  return j as T;
}

export async function evoCreate(instance: string) {
  return evo<{ qrcode?: { base64?: string } }>("/instance/create", { method: "POST", body: { instanceName: instance, qrcode: true, integration: "WHATSAPP-BAILEYS" } });
}
// fresh QR (base64 PNG data URL) while not connected
export async function evoQr(instance: string) {
  const r = await evo<{ base64?: string; pairingCode?: string }>(`/instance/connect/${encodeURIComponent(instance)}`);
  return r.base64 ?? null;
}
export async function evoState(instance: string): Promise<"open" | "close" | "connecting" | string> {
  const r = await evo<{ instance?: { state?: string } }>(`/instance/connectionState/${encodeURIComponent(instance)}`);
  return r.instance?.state ?? "close";
}
export async function evoPhone(instance: string) {
  const r = await evo<{ ownerJid?: string; owner?: string }[]>(`/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`).catch(() => []);
  const jid = r?.[0]?.ownerJid ?? r?.[0]?.owner ?? "";
  return jid ? jid.split("@")[0] : null;
}
export async function evoRemove(instance: string) {
  await evo(`/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" }).catch(() => null);
  await evo(`/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE" }).catch(() => null);
}
// `to` is 923001234567. The server shows "typing…" for a moment first, like a person.
export async function evoSend(instance: string, to: string, text: string) {
  return evo(`/message/sendText/${encodeURIComponent(instance)}`, { method: "POST", body: { number: to, text, delay: 1200 + Math.floor(Math.random() * 1800) } });
}
