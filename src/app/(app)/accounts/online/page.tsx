import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { FeesTabs } from "@/components/fees-tabs";
import { rupees, shortDate } from "@/lib/format";
import { decideClaim, saveWallets } from "../actions";

type Search = { saved?: string; error?: string };
const MODE: Record<string, string> = { jazzcash: "JazzCash", easypaisa: "Easypaisa" };

// Parents who paid the school's JazzCash or Easypaisa account send the transaction ID; the office
// checks it in the wallet app and confirms it, which makes the receipt and tells the family.
export default async function OnlinePayments({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("accountant", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: wallet }, { data: pending }, { data: done }] = await Promise.all([
    supabase.from("school_wallets").select("*").maybeSingle(),
    supabase.from("payment_claims").select("id, amount_paisa, mode, txn_id, paid_on, sender_phone, created_at, families(name, phone), invoices(challan_no)")
      .eq("status", "pending").order("created_at"),
    supabase.from("payment_claims").select("id, amount_paisa, mode, txn_id, status, reason, decided_at, families(name)")
      .neq("status", "pending").order("decided_at", { ascending: false }).limit(20),
  ]);
  type Claim = { id: string; amount_paisa: number; mode: string; txn_id: string; paid_on: string; sender_phone: string | null; created_at: string; families: { name: string; phone: string | null } | null; invoices: { challan_no: string } | null };
  type Done = { id: string; amount_paisa: number; mode: string; txn_id: string; status: string; reason: string | null; decided_at: string | null; families: { name: string } | null };
  const list = (pending ?? []) as unknown as Claim[];
  const total = list.reduce((t, c) => t + Number(c.amount_paisa), 0);
  const saved: Record<string, string> = { wallets: "Saved. Parents see these accounts on their Pay screen.", confirmed: "Confirmed. The receipt is made and the family gets a message.", rejected: "Turned down. The family gets a message." };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Online payments</h1>
          <p className="muted text-base">Parents pay the school&apos;s JazzCash or Easypaisa and send the transaction ID. Check it in the wallet app, then confirm.</p>
        </div>
        <FeesTabs current="online" salaries={me.role === "accountant"} />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">{saved[sp.saved] ?? "Saved."}</div>}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <section className="card flex-[2]">
          <h2 className="h2">Waiting to check · {list.length} · {rupees(total)}</h2>
          {list.length === 0 && <p className="muted">Nothing waiting.</p>}
          {list.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 rounded-xl p-3" style={{ background: "var(--page)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-extrabold">{c.families?.name} · <span className="tabular-nums">{rupees(Number(c.amount_paisa))}</span></div>
                  <div className="muted text-xs">{MODE[c.mode]} · TID <b>{c.txn_id}</b> · paid {shortDate(c.paid_on)}{c.sender_phone ? ` · from ${c.sender_phone}` : ""}{c.invoices ? ` · challan ${c.invoices.challan_no}` : ""}</div>
                </div>
                <form action={decideClaim}>
                  <input type="hidden" name="claim_id" value={c.id} /><input type="hidden" name="decision" value="confirm" />
                  <button className="btn" type="submit">Found it · confirm</button>
                </form>
              </div>
              <form action={decideClaim} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="claim_id" value={c.id} /><input type="hidden" name="decision" value="reject" />
                <label className="field flex-1">Reason if not found<input className="input" name="reason" placeholder="e.g. No payment with this TID" /></label>
                <button className="btn-ghost" type="submit">Not found</button>
              </form>
            </div>
          ))}
          {(done ?? []).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <b>Recently checked</b>
              {((done ?? []) as unknown as Done[]).map((c) => (
                <div key={c.id} className="flex flex-wrap justify-between gap-2 text-sm font-bold">
                  <span>{c.families?.name} · {rupees(Number(c.amount_paisa))} · {MODE[c.mode]} TID {c.txn_id}</span>
                  <span className={`pill ${c.status === "confirmed" ? "pill-green" : "pill-red"}`}>{c.status === "confirmed" ? "Confirmed" : `Not found${c.reason ? `: ${c.reason}` : ""}`}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <form action={saveWallets} className="card flex-1">
          <h2 className="h2">School&apos;s wallet accounts</h2>
          <p className="muted">Parents see these numbers on their Pay screen.</p>
          <label className="field">JazzCash number<input className="input" name="jazzcash_number" defaultValue={wallet?.jazzcash_number ?? ""} inputMode="tel" /></label>
          <label className="field">JazzCash account name<input className="input" name="jazzcash_title" defaultValue={wallet?.jazzcash_title ?? ""} /></label>
          <label className="field">Easypaisa number<input className="input" name="easypaisa_number" defaultValue={wallet?.easypaisa_number ?? ""} inputMode="tel" /></label>
          <label className="field">Easypaisa account name<input className="input" name="easypaisa_title" defaultValue={wallet?.easypaisa_title ?? ""} /></label>
          <label className="field">Note for parents (optional)<input className="input" name="note" defaultValue={wallet?.note ?? ""} placeholder="e.g. Write the child's roll number in the message" /></label>
          <button className="btn" type="submit">Save</button>
        </form>
      </div>
    </>
  );
}
