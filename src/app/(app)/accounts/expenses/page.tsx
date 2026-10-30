import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { FeesTabs } from "@/components/fees-tabs";
import { allRows } from "@/lib/outbox";
import { rupees, shortDate, todayPK } from "@/lib/format";
import { EXPENSE_MODES } from "@/lib/expense-categories";
import { loadCategories, loadExpenses, monthRange } from "@/lib/expenses";
import { addExpense, voidExpense } from "../money-actions";

type Search = { month?: string; category?: string; saved?: string; error?: string };

// The expense ledger: every rupee spent, by category, with the month's fees and salaries beside it.
export default async function Expenses({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("accountant", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const [from, to] = monthRange(month);
  const yearFrom = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 12, 1)).toISOString().slice(0, 10);

  const [cats, list, year, fees, salaries] = await Promise.all([
    loadCategories(supabase),
    loadExpenses(supabase, from, to),
    allRows<{ spent_on: string; amount_paisa: number }>((a, b) => supabase.from("expenses").select("spent_on, amount_paisa").eq("voided", false).gte("spent_on", yearFrom).lt("spent_on", to).order("id").range(a, b)),
    allRows<{ amount_paisa: number }>((a, b) => supabase.from("payments").select("amount_paisa").gte("received_at", `${from}T00:00:00+05:00`).lt("received_at", `${to}T00:00:00+05:00`).order("id").range(a, b)),
    supabase.from("salary_payments").select("net_paisa").eq("status", "paid").gte("paid_on", from).lt("paid_on", to),
  ]);
  const live = list.filter((e) => !e.voided);
  const spent = live.reduce((t, e) => t + Number(e.amount_paisa), 0);
  const feeIn = fees.reduce((t, p) => t + Number(p.amount_paisa), 0);
  const salaryOut = (salaries.data ?? []).reduce((t, s) => t + Number(s.net_paisa), 0);

  // totals per main group and per sub-category
  const perCat = new Map<string, number>();
  for (const e of live) perCat.set(e.category_id, (perCat.get(e.category_id) ?? 0) + Number(e.amount_paisa));
  const perGroup = cats.groups.map((g) => {
    const subs = cats.subsOf(g.id).map((s) => ({ ...s, total: perCat.get(s.id) ?? 0 })).filter((s) => s.total > 0).sort((a, b) => b.total - a.total);
    return { ...g, subs, total: (perCat.get(g.id) ?? 0) + subs.reduce((t, s) => t + s.total, 0) };
  }).filter((g) => g.total > 0).sort((a, b) => b.total - a.total);
  const top = perGroup[0]?.total ?? 1;

  // last 12 months
  const perMonth = new Map<string, number>();
  for (const e of year) perMonth.set(e.spent_on.slice(0, 7), (perMonth.get(e.spent_on.slice(0, 7)) ?? 0) + Number(e.amount_paisa));
  const months = [...Array(12)].map((_, i) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 12 + i + 1, 1)).toISOString().slice(0, 7));
  const maxMonth = Math.max(1, ...months.map((m) => perMonth.get(m) ?? 0));

  const shown = sp.category ? list.filter((e) => e.category_id === sp.category || cats.groupOf.get(e.category_id) === sp.category) : list;
  const monthName = (m: string, long = true) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: long ? "long" : "short", year: long ? "numeric" : undefined, timeZone: "UTC" });
  const catLabel = (id: string) => {
    const c = cats.byId.get(id);
    const g = c?.parent_id ? cats.byId.get(c.parent_id) : null;
    return g ? `${g.name} › ${c!.name}` : c?.name ?? "";
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Expenses</h1>
          <p className="muted text-base">{monthName(month)}: every expense with its voucher, category totals, and what is left after salaries.</p>
        </div>
        <FeesTabs current="expenses" salaries={me.role === "accountant"} />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tile"><span className="muted">Fees received</span><b>{rupees(feeIn)}</b><span className="muted text-xs">{monthName(month)}</span></div>
        <div className="tile"><span className="muted">Salaries paid</span><b>{rupees(salaryOut)}</b><span className="muted text-xs">from Salaries</span></div>
        <div className="tile"><span className="muted">Other expenses</span><b>{rupees(spent)}</b><span className="muted text-xs">{live.length} entries</span></div>
        <div className="tile"><span className="muted">Left this month</span><b style={feeIn - salaryOut - spent < 0 ? { color: "var(--red-ink)" } : undefined}>{rupees(feeIn - salaryOut - spent)}</b><span className="muted text-xs">fees − salaries − expenses</span></div>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="flex flex-[2] flex-col gap-5">
          <section className="card">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <form className="flex items-end gap-2">
                <label className="field">Month<input className="input" type="month" name="month" defaultValue={month} /></label>
                <button className="btn-ghost" type="submit">Show</button>
              </form>
              <div className="flex gap-3">
                <a href={`/accounts/expenses/export.csv?month=${month}`} className="eyebrow">Download Excel (CSV)</a>
                <Link href="/accounts/expenses/categories" className="eyebrow">Categories</Link>
              </div>
            </div>
            <h2 className="h2">By category</h2>
            {perGroup.length === 0 && <p className="muted">Nothing spent this month yet.</p>}
            {perGroup.map((g) => (
              <details key={g.id}>
                <summary className="cursor-pointer list-none">
                  <div className="grid grid-cols-[minmax(0,12rem)_1fr_7rem] items-center gap-3">
                    <span className="font-extrabold">{g.name}</span>
                    <div className="track"><i style={{ width: `${(g.total / top) * 100}%` }} /></div>
                    <span className="text-right font-black tabular-nums">{rupees(g.total)}</span>
                  </div>
                </summary>
                <div className="mt-1 flex flex-col gap-1 pl-4">
                  {g.subs.map((s) => (
                    <Link key={s.id} href={`/accounts/expenses?month=${month}&category=${s.id}`} className="flex justify-between text-sm font-bold hover:underline"><span>{s.name}</span><span className="tabular-nums">{rupees(s.total)} · {spent ? Math.round((s.total / spent) * 100) : 0}%</span></Link>
                  ))}
                  <Link href={`/accounts/expenses?month=${month}&category=${g.id}`} className="muted text-xs underline">Show these entries</Link>
                </div>
              </details>
            ))}
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h2">Ledger{sp.category ? ` · ${catLabel(sp.category)}` : ""}</h2>
              {sp.category && <Link href={`/accounts/expenses?month=${month}`} className="eyebrow">Show all</Link>}
            </div>
            {shown.length === 0 && <p className="muted">No entries.</p>}
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th scope="col">Date</th><th scope="col">Voucher</th><th scope="col">Category</th><th scope="col">Paid to</th><th scope="col">By</th><th scope="col" className="text-right">Amount</th><th scope="col" /></tr></thead>
                <tbody>
                  {shown.map((e) => (
                    <tr key={e.id} style={e.voided ? { opacity: 0.5, textDecoration: "line-through" } : undefined}>
                      <td className="whitespace-nowrap">{shortDate(e.spent_on)}</td>
                      <td className="whitespace-nowrap">{e.voucher_no}</td>
                      <td>{catLabel(e.category_id)}</td>
                      <td>{e.paid_to}{e.note ? <span className="muted block text-xs">{e.note}</span> : null}{e.voided && <span className="muted block text-xs">Voided: {e.void_reason}</span>}</td>
                      <td>{EXPENSE_MODES[e.mode]}{e.reference ? <span className="muted block text-xs">{e.reference}</span> : null}</td>
                      <td className="text-right font-black tabular-nums">{rupees(Number(e.amount_paisa))}</td>
                      <td>
                        {!e.voided && (
                          <details>
                            <summary className="muted cursor-pointer text-xs underline">Void</summary>
                            <form action={voidExpense} className="mt-1 flex gap-1">
                              <input type="hidden" name="expense_id" value={e.id} /><input type="hidden" name="month" value={month} />
                              <input className="input min-h-9 w-36 py-1 text-xs" name="reason" placeholder="Why" required aria-label="Reason" />
                              <button className="btn-ghost min-h-9 px-2 text-xs" type="submit">Void</button>
                            </form>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">An entry can&apos;t be edited or deleted. A wrong one is voided with a reason and entered again, so the record stays complete.</p>
          </section>
        </div>

        <div className="flex flex-1 flex-col gap-5">
          <form action={addExpense} className="card">
            <h2 className="h2">Add an expense</h2>
            <input type="hidden" name="month" value={month} />
            {cats.groups.length === 0 ? (
              <p className="muted">No categories yet. <Link href="/accounts/expenses/categories" className="underline">Add the standard school categories</Link> first.</p>
            ) : (
              <>
                <label className="field">Category
                  <select className="input" name="category_id" required defaultValue="">
                    <option value="" disabled>Choose</option>
                    {cats.groups.filter((g) => g.is_active).map((g) => (
                      <optgroup key={g.id} label={g.name}>
                        {cats.subsOf(g.id).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        {cats.subsOf(g.id).length === 0 && <option value={g.id}>{g.name}</option>}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="field">Amount (Rs)<input className="input" name="amount" inputMode="numeric" required /></label>
                  <label className="field">Date<input className="input" type="date" name="spent_on" defaultValue={today} max={today} /></label>
                  <label className="field">Paid by<select className="input" name="mode" defaultValue="cash">{Object.entries(EXPENSE_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="field">Bill / cheque no<input className="input" name="reference" /></label>
                </div>
                <label className="field">Paid to<input className="input" name="paid_to" placeholder="LESCO, Ali Stationers" /></label>
                <label className="field">Note<input className="input" name="note" /></label>
                <button className="btn self-start" type="submit">Save expense</button>
                <p className="muted">Cash expenses come off what should be in the drawer at Day close.</p>
              </>
            )}
          </form>

          <section className="card">
            <h2 className="h2">Last 12 months</h2>
            <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Expenses in each of the last 12 months">
              {months.map((m) => (
                <Link key={m} href={`/accounts/expenses?month=${m}`} className="flex flex-1 flex-col items-center gap-1" title={`${monthName(m)}: ${rupees(perMonth.get(m) ?? 0)}`}>
                  <div className="w-full max-w-7 rounded-md" style={{ height: `${Math.max(3, ((perMonth.get(m) ?? 0) / maxMonth) * 110)}px`, background: m === month ? "var(--blue-ink)" : "var(--orange)" }} />
                  <span className="text-[10px] font-bold text-[var(--muted)]">{monthName(m, false)}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
