import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { FeesTabs } from "@/components/fees-tabs";
import { allRows } from "@/lib/outbox";
import { mobilePK, showPhone } from "@/lib/messages";
import { rupees, shortDate, todayPK } from "@/lib/format";
import { CALL_RESULT } from "@/lib/expense-categories";
import { logCall } from "../money-actions";

type Search = { view?: string; page?: string; saved?: string; error?: string };
type Call = { family_id: string; result: string; promise_on: string | null; promise_paisa: number | null; note: string | null; called_at: string };
const VIEWS: Record<string, string> = { today: "Call today", promised: "Promises", all: "All with dues" };
const PAGE = 40;

// Who to call about fees today: promises that fell due first, then families never called, biggest dues first.
export default async function Defaulters({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("accountant", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const view = VIEWS[sp.view ?? ""] ? sp.view! : "today";
  const since = new Date(Date.parse(today) - 120 * 86400000).toISOString();

  const [owing, calls, pays] = await Promise.all([
    allRows<{ family_id: string; name: string; balance_paisa: number }>((a, b) =>
      supabase.from("family_balances").select("family_id, name, balance_paisa").gt("balance_paisa", 0).order("family_id").range(a, b)),
    allRows<Call>((a, b) => supabase.from("fee_calls").select("family_id, result, promise_on, promise_paisa, note, called_at").gte("called_at", since).order("called_at", { ascending: false }).order("id").range(a, b)),
    allRows<{ family_id: string; received_at: string; amount_paisa: number }>((a, b) =>
      supabase.from("payments").select("family_id, received_at, amount_paisa").gte("received_at", since).order("received_at", { ascending: false }).order("id").range(a, b)),
  ]);
  const lastCall = new Map<string, Call>();
  for (const c of calls) if (!lastCall.has(c.family_id)) lastCall.set(c.family_id, c);
  const lastPay = new Map<string, { received_at: string; amount_paisa: number }>();
  for (const p of pays) if (!lastPay.has(p.family_id)) lastPay.set(p.family_id, p);

  const rows = owing.map((f) => {
    const call = lastCall.get(f.family_id);
    const pay = lastPay.get(f.family_id);
    const paidSinceCall = !!(call && pay && pay.received_at > call.called_at);
    const promiseDue = call?.result === "promised" && !!call.promise_on && call.promise_on <= today && !paidSinceCall;
    const broken = promiseDue && call!.promise_on! < today;
    // a family called in the last 3 days without a promise can wait
    const recent = call && Date.parse(today) - Date.parse(call.called_at.slice(0, 10)) < 3 * 86400000 && call.result !== "promised";
    const rank = promiseDue ? 0 : !call ? 1 : call.result === "promised" && !paidSinceCall ? 3 : recent ? 4 : 2;
    return { ...f, balance: Number(f.balance_paisa), call, pay, promiseDue, broken, rank };
  });
  const shown = rows
    .filter((r) => view === "all" || (view === "promised" ? r.call?.result === "promised" : r.rank <= 2))
    .sort((a, b) => a.rank - b.rank || b.balance - a.balance);
  const page = Math.max(0, Number(sp.page) || 0);
  const slice = shown.slice(page * PAGE, page * PAGE + PAGE);
  const { data: fams } = slice.length
    ? await supabase.from("families").select("id, phone, reminder_phone").in("id", slice.map((r) => r.family_id))
    : { data: [] };
  const phoneOf = new Map((fams ?? []).map((f) => [f.id, mobilePK(f.reminder_phone ?? f.phone)]));
  const total = rows.reduce((t, r) => t + r.balance, 0);
  const due = rows.filter((r) => r.promiseDue);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Defaulters</h1>
          <p className="muted text-base">Who to call today about fees, what they said, and the date they promised to pay.</p>
        </div>
        <FeesTabs current="calls" salaries={me.role === "accountant"} />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Call saved.</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tile"><span className="muted">Families with dues</span><b>{rows.length}</b><span className="muted text-xs">{rupees(total)} in all</span></div>
        <div className="tile"><span className="muted">Promises due today</span><b>{due.filter((r) => !r.broken).length}</b><span className="muted text-xs">check if they paid</span></div>
        <div className="tile"><span className="muted">Promises broken</span><b>{due.filter((r) => r.broken).length}</b><span className="muted text-xs">date passed, not paid</span></div>
        <div className="tile"><span className="muted">Never called</span><b>{rows.filter((r) => !r.call).length}</b><span className="muted text-xs">in the last 4 months</span></div>
      </div>

      <section className="card">
        <div className="flex flex-wrap gap-2">
          {Object.entries(VIEWS).map(([k, v]) => (
            <Link key={k} href={`/accounts/calls?view=${k}`} className={`pill ${k === view ? "pill-blue" : "pill-gray"}`}>{v}</Link>
          ))}
          <span className="muted self-center text-sm">{shown.length} families</span>
        </div>
        {slice.length === 0 && <p className="muted">Nobody to call here.</p>}
        {slice.map((r) => {
          const phone = phoneOf.get(r.family_id);
          const script = `Assalam-o-Alaikum, main ${me.campus_name} ke accounts office se baat kar raha/rahi hun. ${r.name} ki fee ${rupees(r.balance)} baqi hai${r.pay ? `; aakhri payment ${shortDate(r.pay.received_at.slice(0, 10))} ko aayi thi` : ""}. Aap kab tak jama kara sakte hain? Cash school office mein, ya JazzCash / Easypaisa se.`;
          return (
            <div key={r.family_id} className="flex flex-col gap-2 rounded-2xl border-2 p-3" style={{ borderColor: r.broken ? "var(--red-ink)" : "var(--line)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/accounts?family=${r.family_id}`} className="font-black hover:underline">{r.name}</Link>
                <span className="flex flex-wrap items-center gap-2">
                  {r.broken && <span className="pill pill-red">Promise broken</span>}
                  {r.promiseDue && !r.broken && <span className="pill pill-orange">Promised today</span>}
                  <b className="tabular-nums">{rupees(r.balance)}</b>
                </span>
              </div>
              <div className="muted text-xs">
                {phone ? <a href={`tel:+${phone}`} className="font-extrabold underline">{showPhone(phone)}</a> : "No mobile number"}
                {" · "}{r.pay ? `last paid ${rupees(Number(r.pay.amount_paisa))} on ${shortDate(r.pay.received_at.slice(0, 10))}` : "no payment in 4 months"}
                {r.call && ` · last call ${shortDate(r.call.called_at.slice(0, 10))}: ${CALL_RESULT[r.call.result]}${r.call.promise_on ? ` for ${shortDate(r.call.promise_on)}${r.call.promise_paisa ? ` (${rupees(Number(r.call.promise_paisa))})` : ""}` : ""}${r.call.note ? `, "${r.call.note}"` : ""}`}
              </div>
              <details>
                <summary className="eyebrow cursor-pointer">What to say</summary>
                <p className="mt-1 rounded-xl p-3 text-sm font-semibold" style={{ background: "var(--page)" }}>{script}</p>
              </details>
              <form action={logCall} className="grid items-end gap-2 md:grid-cols-[11rem_9rem_7rem_1fr_auto]">
                <input type="hidden" name="family_id" value={r.family_id} /><input type="hidden" name="view" value={view} />
                <select className="input min-h-10 py-1 text-sm" name="result" defaultValue="" aria-label="What happened" required>
                  <option value="" disabled>What happened?</option>
                  {Object.entries(CALL_RESULT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input className="input min-h-10 py-1 text-sm" type="date" name="promise_on" min={today} aria-label="Promised date" />
                <input className="input min-h-10 py-1 text-sm" name="promise_amount" inputMode="numeric" placeholder="Rs" aria-label="Promised amount" />
                <input className="input min-h-10 py-1 text-sm" name="note" placeholder="Note" aria-label="Note" />
                <button className="btn min-h-10 px-4 text-sm" type="submit">Save call</button>
              </form>
            </div>
          );
        })}
        <div className="flex justify-between">
          {page > 0 ? <Link href={`/accounts/calls?view=${view}&page=${page - 1}`} className="eyebrow">‹ Previous</Link> : <span />}
          {(page + 1) * PAGE < shown.length && <Link href={`/accounts/calls?view=${view}&page=${page + 1}`} className="eyebrow">Next ›</Link>}
        </div>
      </section>
    </>
  );
}
