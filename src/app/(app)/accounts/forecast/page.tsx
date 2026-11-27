import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { allRows } from "@/lib/outbox";
import { mobilePK, whatsappLink } from "@/lib/messages";
import { pct, rupees, shortDate, todayPK } from "@/lib/format";

type Inv = { id: string; family_id: string; billing_month: string; due_on: string; invoice_lines: { amount_paisa: number }[] };
type Pay = { family_id: string; received_at: string; amount_paisa: number };
type Fam = { id: string; name: string; phone: string | null; reminder_phone: string | null };
const DAY = 864e5;

// Which families will probably pay late this month, judged by the last six months:
// how often they paid after the due date, what they owe now and how long since they paid.
export default async function Forecast() {
  const me = await requireRole("accountant", "principal", "owner");
  const sb = await createClient();
  const today = todayPK();
  const since = new Date(Date.parse(today) - 200 * DAY).toISOString().slice(0, 10);
  const [invs, pays, owing, fams] = await Promise.all([
    allRows<Inv>((a, b) => sb.from("invoices").select("id, family_id, billing_month, due_on, invoice_lines(amount_paisa)").gte("billing_month", since).lt("due_on", today).order("id").range(a, b)),
    allRows<Pay>((a, b) => sb.from("payments").select("family_id, received_at, amount_paisa").gte("received_at", since).order("id").range(a, b)),
    allRows<{ family_id: string; balance_paisa: number }>((a, b) => sb.from("family_balances").select("family_id, balance_paisa").order("family_id").range(a, b)),
    allRows<Fam>((a, b) => sb.from("families").select("id, name, phone, reminder_phone").order("id").range(a, b)),
  ]);
  const payBy = new Map<string, Pay[]>();
  for (const p of pays) payBy.set(p.family_id, [...(payBy.get(p.family_id) ?? []), p]);
  const bal = new Map(owing.map((o) => [o.family_id, Number(o.balance_paisa)]));
  const stats = new Map<string, { n: number; late: number }>();
  for (const i of invs) {
    const amt = i.invoice_lines.reduce((t, l) => t + Number(l.amount_paisa), 0);
    if (amt <= 0) continue;
    const from = Date.parse(i.billing_month) - 20 * DAY, to = Date.parse(i.due_on) + DAY;
    const paid = (payBy.get(i.family_id) ?? []).filter((p) => { const t = Date.parse(p.received_at); return t >= from && t < to; }).reduce((t, p) => t + Number(p.amount_paisa), 0);
    const s = stats.get(i.family_id) ?? { n: 0, late: 0 };
    s.n++; if (paid < amt * 0.9) s.late++;
    stats.set(i.family_id, s);
  }
  const rows = fams.map((f) => {
    const s = stats.get(f.id); const b = bal.get(f.id) ?? 0;
    const last = (payBy.get(f.id) ?? []).map((p) => p.received_at).sort().at(-1) ?? null;
    const quiet = last ? (Date.parse(today) - Date.parse(last)) / DAY : 999;
    if (!s && b <= 0) return null;
    const lateRate = s ? s.late / s.n : 0;
    const risk = Math.min(1, lateRate * 0.6 + (b > 0 ? 0.25 : 0) + (b > 0 && quiet > 45 ? 0.15 : 0));
    return { f, s, b, last, risk, lateRate };
  }).filter((r): r is NonNullable<typeof r> => !!r && r.risk >= 0.35).sort((a, b) => b.risk - a.risk || b.b - a.b);
  const high = rows.filter((r) => r.risk >= 0.7);
  const atRisk = rows.reduce((t, r) => t + r.b, 0);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><Link href={me.role === "accountant" ? "/accounts" : "/principal/reports"} className="kick underline">← {me.role === "accountant" ? "Fees" : "Reports"}</Link><h1 className="h1">Late fee forecast</h1>
          <p className="muted text-base">Families likely to pay late this month, from their last six months. Remind them before the due date.</p></div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tile"><span className="muted">Likely late</span><b>{rows.length}</b></div>
        <div className="tile"><span className="muted">High risk</span><b style={{ color: "var(--red-ink)" }}>{high.length}</b></div>
        <div className="tile"><span className="muted">They owe now</span><b>{rupees(atRisk)}</b></div>
        <div className="tile"><span className="muted">Months looked at</span><b>{invs.length ? 6 : 0}</b></div>
      </div>
      <section className="card">
        {rows.length === 0 && <p className="muted">{invs.length ? "No family looks likely to pay late." : "Not enough challans yet to forecast. It starts working after a month or two of challans."}</p>}
        {rows.map((r) => {
          const phone = mobilePK(r.f.reminder_phone) ?? mobilePK(r.f.phone);
          const msg = `Assalam-o-Alaikum. A gentle reminder from ${me.campus_name}: this month's fee is due soon.${r.b > 0 ? ` Current balance ${rupees(r.b)}.` : ""} Paying on time helps us a lot. JazakAllah.`;
          return (
            <div key={r.f.id} className="row-box flex-wrap">
              <span className={`pill ${r.risk >= 0.7 ? "pill-red" : "pill-orange"}`}>{pct(r.risk)}</span>
              <div className="min-w-40 flex-1"><div className="font-extrabold">{r.f.name}</div>
                <div className="muted text-xs">{r.s ? `late ${r.s.late} of ${r.s.n} months` : "no challan history"}{r.b > 0 ? ` · owes ${rupees(r.b)}` : ""} · last paid {r.last ? shortDate(r.last) : "never"}</div></div>
              {phone ? <a className="btn-ghost min-h-10 px-3 text-sm" target="_blank" rel="noreferrer" href={whatsappLink(phone, msg)}>Remind early</a> : <span className="muted text-xs">no mobile</span>}
            </div>
          );
        })}
        <p className="muted text-xs">Risk = 60% how often late + 25% if owing now + 15% if owing and nothing paid in 45 days.</p>
      </section>
    </>
  );
}
