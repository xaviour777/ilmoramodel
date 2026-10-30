import Link from "next/link";
import { FeesTabs } from "@/components/fees-tabs";
import { randomUUID } from "crypto";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { LiveRefresh } from "@/components/live-refresh";
import { rupees, shortDate, todayPK } from "@/lib/format";
import { SendButton } from "@/components/send-button";
import { CHANNEL_LABEL, CHOICE_LABEL, feeReminderText, showPhone, type Channel } from "@/lib/messages";
import { withRecommendations, type FamilyContact } from "@/lib/outbox";
import { recordPayment, setReminderContact } from "./actions";

// The school takes fees only in cash or through JazzCash and Easypaisa.
const MODES = [["cash", "Cash"], ["jazzcash", "JazzCash"], ["easypaisa", "Easypaisa"]];
const MODE_LABEL: Record<string, string> = { cash: "Cash", jazzcash: "JazzCash", easypaisa: "Easypaisa", cheque: "Cheque", bank_deposit: "Bank deposit", onebill: "1Bill", raast: "Raast", card: "Card" };

export default async function FeeDesk({ searchParams }: { searchParams: Promise<{ q?: string; family?: string; saved?: string; error?: string }> }) {
  const me = await requireRole("accountant", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const dayStart = new Date(today + "T00:00:00+05:00").toISOString();

  const [{ data: todayPayments }, { data: owing }, results] = await Promise.all([
    supabase.from("payments").select("amount_paisa, mode").gte("received_at", dayStart),
    supabase.from("family_balances").select("family_id, name, balance_paisa").gt("balance_paisa", 0).order("balance_paisa", { ascending: false }).limit(8),
    sp.q
      ? supabase.from("families").select("id, name, phone").or(["name", "phone", "reminder_phone"].map((c) => `${c}.ilike.%${sp.q!.replace(/[%,()]/g, "")}%`).join(",")).limit(8)
      : Promise.resolve({ data: [] as { id: string; name: string; phone: string }[] }),
  ]);
  const total = (todayPayments ?? []).reduce((t, p) => t + Number(p.amount_paisa), 0);
  const cash = (todayPayments ?? []).filter((p) => p.mode === "cash").reduce((t, p) => t + Number(p.amount_paisa), 0);

  let family: FamilyContact | null = null;
  let balance = 0;
  let lines: { id: string; description: string; amount_paisa: number }[] = [];
  let invoice: { id: string; challan_no: string; due_on: string } | null = null;
  let history: { id: string; amount_paisa: number; mode: string; received_at: string; receipt_no: string | null }[] = [];
  if (sp.family) {
    const [f, b, inv, pays] = await Promise.all([
      supabase.from("families").select("id, name, phone, reminder_phone, reminder_channel").eq("id", sp.family).single(),
      supabase.from("family_balances").select("balance_paisa").eq("family_id", sp.family).single(),
      supabase.from("invoices").select("id, challan_no, due_on, invoice_lines(id, description, amount_paisa)").eq("family_id", sp.family).order("billing_month", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("payments").select("id, amount_paisa, mode, received_at, receipt_no").eq("family_id", sp.family).order("received_at", { ascending: false }).limit(5),
    ]);
    family = f.data; balance = Number(b.data?.balance_paisa ?? 0);
    if (inv.data) { invoice = inv.data; lines = inv.data.invoice_lines; }
    history = pays.data ?? [];
  }
  const { data: kids } = family ? await supabase.from("students").select("full_name, sections(name, classes(name))").eq("family_id", family.id) : { data: [] };
  const rec = family ? (await withRecommendations(supabase, [family], true))[0].rec : null;
  const reminder = family && balance > 0
    ? feeReminderText({ familyName: family.name, balancePaisa: balance, dueOn: invoice?.due_on ?? null, campus: me.campus_name })
    : "";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Fee desk</h1><p className="muted text-base">{shortDate(today)}</p></div>
        <div className="flex items-center gap-3">
          <FeesTabs current="desk" />
          <LiveRefresh tables={["payments"]} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tile"><span className="muted">Collected today</span><b>{rupees(total)}</b><span className="text-xs font-extrabold" style={{ color: "var(--green-ink)" }}>{todayPayments?.length ?? 0} receipts</span></div>
        <div className="tile"><span className="muted">Cash at counter</span><b>{rupees(cash)}</b><span className="muted text-xs">deposit before the deadline</span></div>
        <div className="tile"><span className="muted">Online today</span><b>{rupees(total - cash)}</b><span className="muted text-xs">JazzCash and Easypaisa</span></div>
        <div className="tile"><span className="muted">Families owing</span><b>{owing?.length ?? 0}{(owing?.length ?? 0) === 8 ? "+" : ""}</b><span className="muted text-xs">see the list</span></div>
      </div>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <section className="card flex-[2]">
          <form className="flex items-end gap-2">
            <label className="field flex-1">Find a family<input className="input" name="q" defaultValue={sp.q} placeholder="Name or phone number" /></label>
            <button className="btn-ghost" type="submit">Search</button>
          </form>
          {(results.data ?? []).map((r) => (
            <Link key={r.id} href={`/accounts?family=${r.id}`} className="row-box hover:border-[var(--blue-ring)]"><b className="flex-1">{r.name}</b><span className="muted">{r.phone}</span></Link>
          ))}
          {sp.saved === "contact" && <div className="notice-ok">Reminder number saved.</div>}
          {sp.saved && sp.saved !== "contact" && <div className="notice-ok">Payment saved.</div>}
          {sp.error && <div className="notice-bad">{sp.error}</div>}
          {family && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 p-3.5" style={{ borderColor: "var(--blue-ring)", background: "var(--blue-soft)" }}>
                <div>
                  <div className="text-lg font-black">{family.name}</div>
                  <div className="text-sm font-bold" style={{ color: "#075A85" }}>
                    {((kids ?? []) as unknown as { full_name: string; sections: { name: string; classes: { name: string } } | null }[]).map((k) => `${k.full_name} · ${k.sections ? `${k.sections.classes.name}-${k.sections.name}` : ""}`).join("  ·  ")}
                  </div>
                </div>
                <span className={`pill ${balance > 0 ? "pill-orange" : "pill-green"}`}>{balance > 0 ? `${rupees(balance)} due` : "All paid"}</span>
              </div>
              {invoice && (
                <div className="flex flex-col gap-2">
                  <div className="eyebrow">Challan {invoice.challan_no} · due {shortDate(invoice.due_on)}</div>
                  {lines.map((l) => (
                    <div key={l.id} className="flex justify-between gap-3 font-extrabold tabular-nums" style={l.amount_paisa < 0 ? { color: "var(--green-ink)" } : undefined}>
                      <span>{l.description}</span><span>{rupees(l.amount_paisa)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t-2 pt-2 text-xl font-black" style={{ borderColor: "var(--line)" }}><span>Balance now</span><span>{rupees(balance)}</span></div>
                </div>
              )}
              <form action={recordPayment} className="flex flex-col gap-3">
                <input type="hidden" name="family_id" value={family.id} />
                <input type="hidden" name="invoice_id" value={invoice?.id ?? ""} />
                <input type="hidden" name="idempotency_key" value={randomUUID()} />
                <fieldset className="field"><legend className="mb-1.5">Paid by</legend>
                  <div className="flex flex-wrap gap-2">
                    {MODES.map(([v, l], i) => (
                      <label key={v} className="seg p"><input type="radio" name="mode" value={v} defaultChecked={i === 0} /><span className="px-3.5">{l}</span></label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="field">Amount (Rs)<input className="input" name="amount" inputMode="numeric" required defaultValue={balance > 0 ? Math.round(balance / 100) : ""} /></label>
                  <label className="field">Receipt no.<input className="input" name="receipt_no" /></label>
                  <label className="field">Reference<input className="input" name="reference" placeholder="JazzCash or Easypaisa transaction ID" /></label>
                </div>
                <button className="btn self-start" type="submit">Save payment</button>
              </form>
              {rec && (
                <div className="flex flex-col gap-2.5 rounded-2xl border-2 p-3.5" style={{ borderColor: "var(--line)" }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-black">Fee reminder</h3>
                    {rec.channel && <span className="pill pill-green">Ilmora suggests {CHANNEL_LABEL[rec.channel]}</span>}
                  </div>
                  <p className="muted">{rec.reason}{rec.phone ? ` To ${showPhone(rec.phone)}.` : ""}</p>
                  {rec.recentlySent && <p className="text-sm font-extrabold" style={{ color: "var(--orange-ink)" }}>{rec.recentlySent}</p>}
                  {rec.phone && reminder && (
                    <>
                      <p className="rounded-xl p-3 text-sm font-semibold" style={{ background: "var(--page)" }}>{reminder}</p>
                      <div className="flex flex-wrap gap-2">
                        {(["whatsapp", "sms"] as Channel[]).map((c) => (
                          <SendButton key={c} channel={c} phone={rec.phone!} body={reminder} kind="fee_reminder" familyId={family!.id} primary={c === rec.channel} />
                        ))}
                      </div>
                    </>
                  )}
                  {rec.phone && !reminder && <p className="muted">Nothing is due, so no reminder is needed.</p>}
                  <form action={setReminderContact} className="grid items-end gap-2 md:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="family_id" value={family.id} />
                    <label className="field">Reminder number<input className="input" name="reminder_phone" inputMode="tel" defaultValue={family.reminder_phone ?? ""} placeholder={family.phone ?? "03001234567"} /></label>
                    <label className="field">Send reminders by
                      <select className="input" name="reminder_channel" defaultValue={family.reminder_channel}>
                        {Object.entries(CHOICE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <button className="btn-ghost" type="submit">Save</button>
                  </form>
                </div>
              )}
              {history.length > 0 && <h3 className="font-black">Recent payments</h3>}
              {history.map((p) => (
                <div key={p.id} className="flex justify-between text-sm font-bold"><span>{new Date(p.received_at).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })} · {MODE_LABEL[p.mode] ?? p.mode} {p.receipt_no ?? ""}</span><span>{rupees(Number(p.amount_paisa))}</span></div>
              ))}
            </>
          )}
          {!family && !sp.q && <p className="muted">Search by parent name or phone to take a payment.</p>}
        </section>
        <section className="card flex-1">
          <h2 className="h2">Largest balances</h2>
          {(owing ?? []).map((o) => (
            <Link key={o.family_id} href={`/accounts?family=${o.family_id}`} className="flex justify-between gap-2 font-extrabold hover:underline">
              <span>{o.name}</span><span className="tabular-nums">{rupees(Number(o.balance_paisa))}</span>
            </Link>
          ))}
        </section>
      </div>
    </>
  );
}
