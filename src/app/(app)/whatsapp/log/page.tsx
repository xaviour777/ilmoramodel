import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { WaTabs } from "@/components/wa-tabs";
import { runNow } from "../flows/actions";

const PILL: Record<string, string> = { queued: "pill-orange", sent: "pill-green", failed: "pill-red", cancelled: "pill-gray" };

export default async function WaLog() {
  await requireRole("principal", "owner", "accountant");
  const sb = await createClient();
  const [{ data: msgs }, { data: nums }, { count: waiting }] = await Promise.all([
    sb.from("messages").select("id, kind, to_phone, body, status, error, created_at, sent_at, via_number").eq("channel", "whatsapp").order("created_at", { ascending: false }).limit(100),
    sb.from("wa_numbers").select("id, label"),
    sb.from("messages").select("id", { count: "exact", head: true }).eq("channel", "whatsapp").eq("status", "queued"),
  ]);
  const label = new Map((nums ?? []).map((n) => [n.id, n.label]));
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="kick">WhatsApp module</div><h1 className="h1">Sent log</h1><p className="muted text-base">The last 100 WhatsApp messages, and which number sent each one.</p></div>
        <WaTabs current="log" />
      </div>
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2"><b>{waiting ?? 0} waiting to go</b>
          <form action={runNow}><input type="hidden" name="back" value="/whatsapp/log" /><button className="btn min-h-10 px-3 text-sm" type="submit">Send waiting now</button></form></div>
        <div className="overflow-x-auto"><table className="tbl min-w-[720px]"><thead><tr><th>When</th><th>To</th><th>Kind</th><th>Message</th><th>From</th><th>Status</th></tr></thead>
          <tbody>{(msgs ?? []).map((m) => (
            <tr key={m.id}><td className="whitespace-nowrap">{new Date(m.sent_at ?? m.created_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
              <td>+{m.to_phone}</td><td>{m.kind.replace("_", " ")}</td><td className="max-w-[320px] truncate" title={m.body}>{m.body}</td><td>{m.via_number ? label.get(m.via_number) ?? "—" : "Business API"}</td>
              <td><span className={`pill ${PILL[m.status]}`} title={m.error ?? ""}>{m.status}</span></td></tr>
          ))}</tbody></table></div>
        {(msgs ?? []).length === 0 && <p className="muted">Nothing sent yet.</p>}
      </section>
    </>
  );
}
