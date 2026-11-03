import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { rupees, shortDate, todayPK } from "@/lib/format";
import { sendPaymentClaim } from "./actions";

type Search = { sent?: string; error?: string };
const MODE: Record<string, string> = { cash: "Cash", jazzcash: "JazzCash", easypaisa: "Easypaisa" };

// The family's fee record: every challan with what is paid, the next fee, receipts, and paying by wallet.
export default async function ParentFees({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("parent");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const [{ data: invoices }, { data: lines }, { data: payments }, { data: balances }, { data: claims }, { data: wallet }, { data: kids }, { data: structures }] = await Promise.all([
    supabase.from("invoices").select("id, family_id, challan_no, billing_month, due_on").order("billing_month", { ascending: false }).limit(36),
    supabase.from("invoice_lines").select("invoice_id, description, amount_paisa"),
    supabase.from("payments").select("id, invoice_id, amount_paisa, mode, reference, receipt_no, received_at").order("received_at", { ascending: false }).limit(60),
    supabase.from("family_balances").select("family_id, balance_paisa"),
    supabase.from("payment_claims").select("id, amount_paisa, mode, txn_id, paid_on, status, reason, created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("school_wallets").select("jazzcash_number, jazzcash_title, easypaisa_number, easypaisa_title, note").maybeSingle(),
    supabase.from("students").select("full_name, family_id, sections(class_id, classes(name))").eq("status", "enrolled"),
    supabase.from("fee_structures").select("class_id, amount_paisa, monthly, fee_heads(name)"),
  ]);
  const due = (balances ?? []).reduce((t, b) => t + Number(b.balance_paisa), 0);
  const family = (balances ?? [])[0]?.family_id ?? (invoices ?? [])[0]?.family_id;
  const billed = new Map<string, number>();
  for (const l of lines ?? []) billed.set(l.invoice_id, (billed.get(l.invoice_id) ?? 0) + Number(l.amount_paisa));
  const paid = new Map<string, number>();
  for (const p of payments ?? []) if (p.invoice_id) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount_paisa));
  const latest = (invoices ?? [])[0];

  // Next month's fee from the class fees (monthly heads only); the challan itself may add more.
  type Kid = { full_name: string; family_id: string; sections: { class_id: string; classes: { name: string } } | null };
  type Fs = { class_id: string; amount_paisa: number; monthly: boolean; fee_heads: { name: string } | null };
  const nextLines = ((kids ?? []) as unknown as Kid[]).map((k) => ({
    name: k.full_name, cls: k.sections?.classes.name ?? "",
    amount: ((structures ?? []) as unknown as Fs[]).filter((s) => s.monthly && s.class_id === k.sections?.class_id).reduce((t, s) => t + Number(s.amount_paisa), 0),
  }));
  const nextTotal = nextLines.reduce((t, l) => t + l.amount, 0);
  const dueDay = latest ? Number(latest.due_on.slice(8, 10)) : 10;
  const nm = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1));
  const nextMonth = nm.toISOString().slice(0, 7);
  const nextDue = `${nextMonth}-${String(Math.min(dueDay, 28)).padStart(2, "0")}`;
  const pending = (claims ?? []).filter((c) => c.status === "pending").reduce((t, c) => t + Number(c.amount_paisa), 0);
  const wallets = [
    wallet?.jazzcash_number ? { id: "jazzcash", label: "JazzCash", number: wallet.jazzcash_number, title: wallet.jazzcash_title } : null,
    wallet?.easypaisa_number ? { id: "easypaisa", label: "Easypaisa", number: wallet.easypaisa_number, title: wallet.easypaisa_title } : null,
  ].filter(Boolean) as { id: string; label: string; number: string; title: string | null }[];
  const status = (id: string, dueOn: string) => {
    const left = (billed.get(id) ?? 0) - (paid.get(id) ?? 0);
    if (left <= 0) return ["Paid", "pill-green"];
    if ((paid.get(id) ?? 0) > 0) return ["Part paid", "pill-orange"];
    return dueOn < today ? ["Overdue", "pill-red"] : ["Due", "pill-orange"];
  };

  return (
    <>
      <div>
        <h1 className="h1">Fees</h1>
        <p className="muted text-base"><Link href="/parent" className="font-extrabold">Back to my children</Link></p>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.sent && <div className="notice-ok">Sent. The school office will check it and send your receipt, usually the same day.</div>}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between"><h2 className="h2">To pay now</h2><span className={`pill ${due > 0 ? "pill-orange" : "pill-green"}`}>{due > 0 ? "Due" : "All paid"}</span></div>
          <div className="text-3xl font-black tabular-nums">{rupees(Math.max(due, 0))}</div>
          {latest && due > 0 && <div className="muted">Challan {latest.challan_no} · last date {shortDate(latest.due_on)}</div>}
          {due < 0 && <div className="muted">You have paid {rupees(-due)} in advance.</div>}
          {pending > 0 && <div className="muted">{rupees(pending)} sent by wallet is waiting for the office to confirm.</div>}
          {due > 0 && <a href="#pay" className="btn self-start">Pay now</a>}
        </section>
        <section className="card">
          <h2 className="h2">Next fee · {new Date(nextMonth + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
          <div className="text-3xl font-black tabular-nums">about {rupees(nextTotal)}</div>
          <div className="muted">To pay by {shortDate(nextDue)}. The challan comes at the start of the month and may include exam or other fees.</div>
          {nextLines.map((l) => <div key={l.name} className="flex justify-between text-sm font-bold"><span>{l.name} · {l.cls}</span><span className="tabular-nums">{rupees(l.amount)}</span></div>)}
        </section>
      </div>

      <section className="card">
        <h2 className="h2">Challans</h2>
        {(invoices ?? []).length === 0 && <p className="muted">No challans yet.</p>}
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th scope="col">Month</th><th scope="col">Challan</th><th scope="col">Last date</th><th scope="col">Fee</th><th scope="col">Paid</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {(invoices ?? []).map((i) => {
                const [label, pill] = status(i.id, i.due_on);
                return (
                  <tr key={i.id}>
                    <td className="whitespace-nowrap">{new Date(i.billing_month + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}</td>
                    <td>{i.challan_no}</td>
                    <td className="whitespace-nowrap">{shortDate(i.due_on)}</td>
                    <td className="tabular-nums">{rupees(billed.get(i.id) ?? 0)}</td>
                    <td className="tabular-nums">{rupees(paid.get(i.id) ?? 0)}</td>
                    <td><span className={`pill ${pill}`}>{label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="h2">Payments and receipts</h2>
        {(payments ?? []).length === 0 && <p className="muted">No payments yet.</p>}
        {(payments ?? []).map((p) => (
          <div key={p.id} className="row-box">
            <span className="pill pill-green">{MODE[p.mode] ?? p.mode}</span>
            <div className="flex-1"><div className="font-extrabold tabular-nums">{rupees(Number(p.amount_paisa))}</div><div className="muted text-xs">{shortDate(p.received_at.slice(0, 10))} · receipt {p.receipt_no}{p.reference ? ` · ${p.reference}` : ""}</div></div>
            <Link href={`/print/receipt/${p.id}`} target="_blank" className="text-sm font-extrabold">Receipt</Link>
          </div>
        ))}
      </section>

      <section id="pay" className="card">
        <h2 className="h2">Pay by JazzCash or Easypaisa</h2>
        {wallets.length === 0 ? (
          <p className="muted">The school hasn&apos;t added its JazzCash or Easypaisa account yet. Please pay in cash at the school office.</p>
        ) : (
          <>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm font-bold">
              <li>Open your JazzCash or Easypaisa app and send the fee to the school&apos;s account below.</li>
              <li>Copy the transaction ID (TID) from the message you get.</li>
              <li>Fill this form. The office checks it and your receipt shows here.</li>
            </ol>
            <div className="grid gap-2 sm:grid-cols-2">
              {wallets.map((w) => (
                <div key={w.id} className="rounded-xl p-3" style={{ background: "var(--page)" }}>
                  <div className="eyebrow">{w.label}</div>
                  <div className="text-xl font-black tabular-nums">{w.number}</div>
                  {w.title && <div className="muted text-sm">{w.title}</div>}
                </div>
              ))}
            </div>
            {wallet?.note && <p className="muted">{wallet.note}</p>}
            {family && (
              <form action={sendPaymentClaim} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2">
                <input type="hidden" name="family_id" value={family} />
                {latest && <input type="hidden" name="invoice_id" value={latest.id} />}
                <label className="field">Paid with<select className="input" name="mode">{wallets.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></label>
                <label className="field">Amount (Rs)<input className="input" name="amount" inputMode="numeric" required defaultValue={due > 0 ? Math.round(due / 100) : ""} /></label>
                <label className="field">Transaction ID (TID)<input className="input" name="txn_id" required minLength={4} maxLength={40} placeholder="e.g. 012345678901" /></label>
                <label className="field">Date paid<input className="input" type="date" name="paid_on" defaultValue={today} max={today} /></label>
                <label className="field">Number you paid from (optional)<input className="input" name="sender_phone" inputMode="tel" placeholder="03xx xxxxxxx" /></label>
                <button className="btn" type="submit">I have paid</button>
              </form>
            )}
          </>
        )}
        {(claims ?? []).length > 0 && (
          <div className="flex flex-col gap-1.5">
            <b>Sent to the office</b>
            {(claims ?? []).map((c) => (
              <div key={c.id} className="flex flex-wrap justify-between gap-2 rounded-xl p-2 text-sm font-bold" style={{ background: "var(--page)" }}>
                <span>{MODE[c.mode]} · {rupees(Number(c.amount_paisa))} · TID {c.txn_id} · {shortDate(c.paid_on)}</span>
                <span className={`pill ${c.status === "confirmed" ? "pill-green" : c.status === "rejected" ? "pill-red" : "pill-gray"}`}>
                  {c.status === "confirmed" ? "Received" : c.status === "rejected" ? `Not found${c.reason ? `: ${c.reason}` : ""}` : "Checking"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
