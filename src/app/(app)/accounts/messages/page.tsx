import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { SendButton } from "@/components/send-button";
import { FeesTabs } from "@/components/fees-tabs";
import { SettingsTabs } from "@/components/settings-tabs";
import { CHANNEL_LABEL, SWITCH_AFTER_DAYS, showPhone, type Channel } from "@/lib/messages";
import { allRows, familiesByIds, withRecommendations } from "@/lib/outbox";
import { loadMessagingConfig, readyChannels } from "@/lib/deliver";
import { cancelQueued, queueFeeReminders, retryFailed, sendWaitingNow } from "../actions";

const KIND: Record<string, string> = { fee_reminder: "Fee reminder", notice: "Notice", holiday: "Holiday" };
type Msg = { id: string; channel: Channel; to_phone: string; body: string; kind: string; status: string; created_at: string; sent_at: string | null; error: string | null; families: { id: string; name: string } | null };
type Search = { queued?: string; skipped?: string; sent?: string; failed?: string; left?: string; error?: string };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("accountant", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const owing = await allRows<{ family_id: string }>((a, b) =>
    supabase.from("family_balances").select("family_id").gt("balance_paisa", 0).order("family_id").range(a, b));
  const recs = await withRecommendations(supabase, await familiesByIds(supabase, owing.map((o) => o.family_id)), true);
  const count = (c: Channel | null) => recs.filter((r) => r.rec.channel === c && !r.rec.recentlySent).length;
  const recent = recs.filter((r) => r.rec.recentlySent).length;

  const cols = "id, channel, to_phone, body, kind, status, created_at, sent_at, error, families(id, name)";
  const [{ data: queued, count: queuedCount }, { data: sent }, { data: failed, count: failedCount }, config] = await Promise.all([
    supabase.from("messages").select(cols, { count: "exact" }).eq("status", "queued").order("created_at").limit(100),
    supabase.from("messages").select(cols).eq("status", "sent").order("sent_at", { ascending: false }).limit(30),
    supabase.from("messages").select(cols, { count: "exact" }).eq("status", "failed").order("created_at", { ascending: false }).limit(20),
    loadMessagingConfig(supabase),
  ]);
  const ready = readyChannels(config);
  const admin = me.role === "principal" || me.role === "owner";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">WhatsApp and SMS</h1>
          <p className="muted text-base">Fee reminders and notices that go to parents&apos; phones, so they get them even if they never open the app.</p>
        </div>
        {admin ? <SettingsTabs current="messages" /> : <FeesTabs current="messages" />}
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.queued && <div className="notice-ok">{sp.queued} reminders are in the outbox.{Number(sp.skipped) > 0 ? ` ${sp.skipped} families were skipped: no mobile number, or reminded in the last ${SWITCH_AFTER_DAYS} days.` : ""}</div>}
      {(Number(sp.sent) > 0 || Number(sp.failed) > 0) && (
        <div className={Number(sp.failed) ? "notice-bad" : "notice-ok"}>
          {sp.sent} sent automatically.{Number(sp.failed) ? ` ${sp.failed} could not be sent, see below.` : ""}{Number(sp.left) ? ` ${sp.left} still waiting: press Send again.` : ""}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill ${ready.includes("whatsapp") ? "pill-green" : "pill-gray"}`}>WhatsApp Business: {ready.includes("whatsapp") ? "connected" : "not connected"}</span>
        <span className={`pill ${ready.includes("sms") ? "pill-green" : "pill-gray"}`}>SMS gateway: {ready.includes("sms") ? "connected" : "not connected"}</span>
        {admin && <Link href="/settings" className="eyebrow underline">Connect in Settings</Link>}
      </div>

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <section className="card xl:w-[400px]">
          <h2 className="h2">Fee reminders</h2>
          <p className="muted">{recs.length} families have fees due. Ilmora picks the channel for each one:</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="tile"><span className="muted">WhatsApp</span><b>{count("whatsapp")}</b><span className="muted text-xs">free, read sooner</span></div>
            <div className="tile"><span className="muted">SMS</span><b>{count("sms")}</b><span className="muted text-xs">asked for SMS, or WhatsApp got no payment in {SWITCH_AFTER_DAYS} days</span></div>
            <div className="tile"><span className="muted">No mobile number</span><b>{count(null)}</b><span className="muted text-xs">add it on the fee desk</span></div>
            <div className="tile"><span className="muted">Reminded lately</span><b>{recent}</b><span className="muted text-xs">skipped this time</span></div>
          </div>
          <form action={queueFeeReminders}><button className="btn w-full" type="submit">Put reminders in the outbox</button></form>
          <p className="muted">Families choose WhatsApp or SMS at admission. Change it for a family on the <Link href="/accounts" className="underline">fee desk</Link>.</p>
        </section>

        <section className="card flex-1">
          <div className="flex items-baseline justify-between"><h2 className="h2">Outbox</h2><span className="pill pill-orange">{queuedCount ?? 0} waiting</span></div>
          <p className="muted">
            {ready.length
              ? `Messages on ${ready.map((c) => CHANNEL_LABEL[c]).join(" and ")} go out by themselves. Others: tap Send and the message opens in WhatsApp or the SMS app with the text ready.`
              : "Tap Send and the message opens in WhatsApp or the SMS app with the text ready. To send without tapping, connect WhatsApp Business or an SMS gateway in Settings."}
          </p>
          {ready.length > 0 && (queuedCount ?? 0) > 0 && (
            <form action={sendWaitingNow}><button className="btn" type="submit">Send waiting messages now</button></form>
          )}
          {(queued ?? []).length === 0 && <p className="muted">Nothing waiting.</p>}
          {((queued ?? []) as unknown as Msg[]).map((m) => (
            <div key={m.id} className="flex flex-col gap-2 rounded-2xl border-2 p-3" style={{ borderColor: "var(--line)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <b>{m.families?.name ?? showPhone(m.to_phone)}</b>
                <span className="muted text-xs">{KIND[m.kind]} · {CHANNEL_LABEL[m.channel]} · {showPhone(m.to_phone)}</span>
              </div>
              <p className="text-sm font-semibold whitespace-pre-line">{m.body}</p>
              <div className="flex flex-wrap items-center gap-2">
                <SendButton channel={m.channel} phone={m.to_phone} body={m.body} kind={m.kind} messageId={m.id} primary label={`Send on ${CHANNEL_LABEL[m.channel]}`} />
                <form action={cancelQueued}><input type="hidden" name="message_id" value={m.id} /><button className="muted text-xs underline" type="submit">Don&apos;t send</button></form>
              </div>
            </div>
          ))}
          {(queuedCount ?? 0) > 100 && <p className="muted">Showing the first 100. Send these and the next ones appear.</p>}

          {(failed ?? []).length > 0 && (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <h3 className="text-lg font-black">Could not send ({failedCount})</h3>
                <form action={retryFailed}><button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Try all again</button></form>
              </div>
              {((failed ?? []) as unknown as Msg[]).map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
                  <span>{m.families?.name ?? showPhone(m.to_phone)} · {CHANNEL_LABEL[m.channel]}</span>
                  <span style={{ color: "var(--red-ink)" }}>{m.error}</span>
                  <SendButton channel={m.channel} phone={m.to_phone} body={m.body} kind={m.kind} messageId={m.id} label="Send by hand" />
                </div>
              ))}
            </>
          )}

          <h3 className="mt-2 text-lg font-black">Sent recently</h3>
          {((sent ?? []) as unknown as Msg[]).map((m) => (
            <div key={m.id} className="flex flex-wrap justify-between gap-2 text-sm font-bold">
              <span>{m.families?.name ?? showPhone(m.to_phone)} · {KIND[m.kind]}</span>
              <span className="muted">{CHANNEL_LABEL[m.channel]} · {new Date(m.sent_at ?? m.created_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
          {(sent ?? []).length === 0 && <p className="muted">Nothing sent yet.</p>}
        </section>
      </div>
    </>
  );
}
