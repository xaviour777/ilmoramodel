import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pct, rupees, todayPK } from "@/lib/format";
import { Stats, Stat, Insight, Empty, Bars, Row } from "@/components/ilm";

const MODE: Record<string, [string, string]> = {
  cash: ["Cash", "#16a34a"], jazzcash: ["JazzCash", "#dc2626"], easypaisa: ["Easypaisa", "#0ea5e9"], bank_deposit: ["Bank", "#7c3aed"],
  raast: ["Raast", "#7c3aed"], onebill: ["1Bill", "#f59e0b"], cheque: ["Cheque", "#6b7280"], card: ["Card", "#6b7280"],
};
const monthName = (m: string, opts: Intl.DateTimeFormatOptions = { month: "short" }) => new Date(m + "T00:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });

// Fees overview for the principal (design/Fees.dc.html): the month's money, trends, defaulters and expenses.
export async function FeesOverview() {
  const supabase = await createClient();
  const today = todayPK();
  const month = today.slice(0, 8) + "01";
  const months = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - (6 - i), 1)); return d.toISOString().slice(0, 10); });
  const [{ data: invoices }, { data: payments }, { data: owing }, { data: structures }, { data: expenses }, { data: salaries }, { count: students }] = await Promise.all([
    supabase.from("invoices").select("billing_month, invoice_lines(amount_paisa), payments(amount_paisa)").gte("billing_month", months[0]).limit(20000),
    supabase.from("payments").select("amount_paisa, mode").gte("received_at", new Date(month + "T00:00:00+05:00").toISOString()),
    supabase.from("family_balances").select("family_id, name, balance_paisa").gt("balance_paisa", 0).order("balance_paisa", { ascending: false }),
    supabase.from("fee_structures").select("amount_paisa, monthly, classes(name, sort), fee_heads(name)"),
    supabase.from("expenses").select("amount_paisa, paid_to, spent_on, expense_categories(name)").gte("spent_on", month).order("amount_paisa", { ascending: false }),
    supabase.from("salary_payments").select("net_paisa, status").eq("month", month),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "enrolled"),
  ]);
  type Inv = { billing_month: string; invoice_lines: { amount_paisa: number }[]; payments: { amount_paisa: number }[] };
  const by = new Map(months.map((m) => [m, { due: 0, paid: 0, conc: 0 }]));
  for (const inv of (invoices ?? []) as Inv[]) {
    const b = by.get(inv.billing_month); if (!b) continue;
    for (const l of inv.invoice_lines) { const a = Number(l.amount_paisa); b.due += a; if (a < 0) b.conc -= a; }
    b.paid += inv.payments.reduce((t, p) => t + Number(p.amount_paisa), 0);
  }
  const cur = by.get(month)!;
  const outstanding = (owing ?? []).reduce((t, o) => t + Number(o.balance_paisa), 0);
  const modes = new Map<string, number>();
  for (const p of payments ?? []) modes.set(p.mode, (modes.get(p.mode) ?? 0) + Number(p.amount_paisa));
  const modeTotal = [...modes.values()].reduce((a, b) => a + b, 0);
  const payrollDue = (salaries ?? []).filter((s) => s.status === "due").reduce((t, s) => t + Number(s.net_paisa), 0);
  const stillToCome = Math.max(0, cur.due - cur.paid);
  const expTotal = (expenses ?? []).reduce((t, e) => t + Number(e.amount_paisa), 0);
  const expByCat = [...((expenses ?? []) as unknown as { amount_paisa: number; expense_categories: { name: string } | null }[])
    .reduce((m, e) => m.set(e.expense_categories?.name ?? "Other", (m.get(e.expense_categories?.name ?? "Other") ?? 0) + Number(e.amount_paisa)), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  type FS = { amount_paisa: number; monthly: boolean; classes: { name: string; sort: number }; fee_heads: { name: string } };
  const tuition = new Map<string, { sort: number; total: number }>();
  for (const f of (structures ?? []) as unknown as FS[]) if (f.monthly) {
    const c = tuition.get(f.classes.name) ?? { sort: f.classes.sort, total: 0 }; c.total += Number(f.amount_paisa); tuition.set(f.classes.name, c);
  }
  const fee = [...tuition.entries()].sort((a, b) => a[1].sort - b[1].sort);
  const trend = months.map((m) => ({ m, ...by.get(m)! })).filter((x) => x.due > 0);

  return (
    <>
      <Stats>
        <Stat label={`Billed · ${monthName(month)}`} value={cur.due ? rupees(cur.due) : "—"} sub={cur.due ? `${students ?? 0} students enrolled` : "no challans this month yet"} />
        <Stat label="Collected" value={rupees(cur.paid)} tone="#15803d" sub={cur.due ? `${pct(cur.paid / cur.due)} of ${monthName(month, { month: "long" })}` : "against this month's challans"} />
        <Stat label="Concessions" value={rupees(cur.conc)} sub="discounts on this month's challans" />
        <Stat label="Outstanding" value={rupees(outstanding)} tone={outstanding ? "#b91c1c" : undefined} sub={`${(owing ?? []).length} families`} href="/accounts/calls" />
      </Stats>
      <section className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-5">
          <div className="card">
            <h2 className="h2">Collection by month</h2>
            <p className="muted text-[13px]">Share of each month&apos;s challans paid so far</p>
            <div className="mt-4">{trend.length ? <Bars bars={trend.map((t) => ({ label: monthName(t.m), value: Math.round((t.paid / t.due) * 100), note: pct(t.paid / t.due), color: t.paid / t.due >= 0.85 ? "#16a34a" : "#f59e0b" }))} />
              : <Empty>No challans in the last seven months.</Empty>}</div>
          </div>
          <div className="card">
            <h2 className="h2">By payment method · {monthName(month, { month: "long" })}</h2>
            {modeTotal ? (
              <>
                <div className="mt-3 flex h-6 overflow-hidden rounded-full" role="img" aria-label={[...modes.entries()].map(([k, v]) => `${MODE[k]?.[0] ?? k} ${rupees(v)}`).join(", ")}>
                  {[...modes.entries()].map(([k, v]) => <div key={k} style={{ width: `${(v / modeTotal) * 100}%`, background: MODE[k]?.[1] ?? "#6b7280" }} />)}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px] font-extrabold">
                  {[...modes.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: MODE[k]?.[1] ?? "#6b7280" }} />{MODE[k]?.[0] ?? k} · {rupees(v)}</span>)}
                </div>
              </>
            ) : <div className="mt-2"><Empty>No payments received this month yet.</Empty></div>}
          </div>
        </div>
        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
          <Insight title="Cash flow">
            {cur.due ? `${rupees(stillToCome)} of this month's challans is still to come.` : "This month's challans aren't made yet."}
            {payrollDue ? ` Salaries still to pay this month: ${rupees(payrollDue)}${stillToCome < payrollDue ? `, more than the fees still expected, so plan for a ${rupees(payrollDue - stillToCome)} gap` : ""}.` : ""}
            {expTotal ? ` Expenses so far: ${rupees(expTotal)}.` : ""}
          </Insight>
          <div className="card">
            <div className="flex items-center justify-between"><h2 className="h2">Fee structure</h2><Link href="/accounts/setup" className="text-[13px] font-black text-[#0369a1]">Change</Link></div>
            {fee.map(([n, f]) => <Row key={n}><span className="flex-1 font-bold">{n}</span><span className="font-black tabular-nums">{rupees(f.total)} / month</span></Row>)}
            {fee.length === 0 && <div className="mt-2"><Empty>No monthly fees set yet.</Empty></div>}
          </div>
        </div>
      </section>
      <section className="flex flex-wrap items-start gap-5">
        <div className="card min-w-0 flex-[3_1_520px]">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Defaulters · {(owing ?? []).length} families</h2>
            <div className="flex gap-2"><Link href="/accounts/messages" className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }}>Send reminders</Link><Link href="/accounts/calls" className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }}>Call list</Link></div></div>
          <div className="tbl mt-2 overflow-x-auto"><table className="w-full">
            <thead><tr><th className="text-left">Family</th><th className="text-left">Amount</th><th /></tr></thead>
            <tbody>{(owing ?? []).slice(0, 8).map((o) => (
              <tr key={o.family_id}><td><b>{o.name}</b></td><td className="tabular-nums">{rupees(Number(o.balance_paisa))}</td>
                <td className="text-right"><Link href={`/accounts?view=desk&family=${o.family_id}`} className="btn-ghost" style={{ minHeight: 32, padding: "0 10px", fontSize: 12 }}>Collect</Link></td></tr>
            ))}</tbody>
          </table></div>
          {(owing ?? []).length === 0 && <Empty>No family owes anything.</Empty>}
        </div>
        <div className="card min-w-0 flex-[2_1_320px]">
          <div className="flex items-center justify-between"><h2 className="h2">Expenses · {monthName(month, { month: "long" })}</h2><Link href="/accounts/expenses" className="btn" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }}>Add expense</Link></div>
          {expByCat.slice(0, 6).map(([n, v], i) => (
            <Row key={n}><span className={`ilm-tile ${["t-b", "t-o", "t-g", "t-v", "t-p", "t-n"][i]} font-black`}>{n[0]}</span><span className="flex-1 font-bold">{n}</span><span className="font-black tabular-nums">{rupees(v)}</span></Row>
          ))}
          {expByCat.length === 0 && <div className="mt-2"><Empty>No expenses this month.</Empty></div>}
        </div>
      </section>
    </>
  );
}
