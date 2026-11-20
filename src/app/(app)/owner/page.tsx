import Link from "next/link";
import { requireRole } from "@/lib/me";
import { insights, loadGroup, pc, qs, rs, type OwnerSearch } from "@/lib/owner";
import { HBars, Kpis, Notes, OwnerFilter, STATUS_TAG } from "@/components/owner-ui";
import { decideApproval } from "./actions";

type Search = OwnerSearch & { s?: string; saved?: string; error?: string };
const SORTS = [["score", "Score"], ["profit", "Profit"], ["students", "Students"], ["fees", "Fee collection"]] as const;
const KIND: Record<string, [string, string]> = { payroll: ["B", "t-b"], concession: ["F", "t-o"], expense: ["E", "t-v"], hiring: ["H", "t-g"], fee_change: ["%", "t-p"], other: ["?", "t-n"] };

// Owner overview (design/Owner.dc.html).
export default async function OwnerHome({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("owner");
  const sp = await searchParams;
  const g = await loadGroup(sp);
  const { supabase, all, sel, sum } = g;
  const one = g.camp === "all" ? null : g.camp;
  const [{ data: months }, { data: heads }, { data: approvals }, { data: checklist }, { data: nextPay }] = await Promise.all([
    supabase.rpc("owner_months", { p_campus: one, p_months: 6 }),
    supabase.rpc("owner_expense_heads", { p_from: g.from, p_to: g.to }),
    supabase.from("approvals").select("id, kind, title, detail, amount_paisa, monthly, created_at, campus_id, profiles!approvals_requested_by_fkey(full_name)").eq("status", "pending").order("created_at"),
    supabase.from("campus_checklist").select("id, campus_id, item, status, note, sort").order("sort"),
    supabase.from("salary_payments").select("net_paisa, month, campus_id").eq("status", "due"),
  ]);
  const students = sum((c) => c.students), seats = sum((c) => c.seats ?? 0), billed = sum((c) => c.billed), collected = sum((c) => c.collected);
  const costs = sum((c) => c.costs), profit = collected - costs, marked = sum((c) => c.att_marked);
  const live = sel.filter((c) => c.results != null);
  const results = live.length ? live.reduce((t, c) => t + Number(c.results), 0) / live.length : null;
  const sortKey: Record<string, (c: (typeof all)[number]) => number> = { score: (c) => c.score ?? -1, profit: (c) => c.profit, students: (c) => c.students, fees: (c) => c.colRate ?? -1 };
  const sort = sortKey[sp.s ?? ""] ? sp.s! : "score";
  const rows = [...all].sort((a, b) => sortKey[sort](b) - sortKey[sort](a));
  type M = { month: string; collected: number; expenses: number; payroll: number };
  const M = (months ?? []) as M[];
  const mx = Math.max(1, ...M.flatMap((m) => [Number(m.collected), Number(m.expenses) + Number(m.payroll)]));
  const ids = new Set(sel.map((c) => c.id));
  const headSum = new Map<string, number>();
  for (const h of (heads ?? []) as { campus_id: string; head: string; amount: number }[]) if (ids.has(h.campus_id)) headSum.set(h.head, (headSum.get(h.head) ?? 0) + Number(h.amount));
  const payroll = sum((c) => c.payroll);
  if (payroll) headSum.set("Salaries", (headSum.get("Salaries") ?? 0) + payroll);
  const headTotal = [...headSum.values()].reduce((a, b) => a + b, 0);
  const yearCash = M.reduce((t, m) => t + Number(m.collected) - Number(m.expenses) - Number(m.payroll), 0);
  const due = (nextPay ?? []).filter((p) => ids.has(p.campus_id)).reduce((t, p) => t + Number(p.net_paisa), 0);
  const name = new Map(all.map((c) => [c.id, c.name]));
  const opening = all.filter((c) => c.status === "opening");
  const today = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const pending = (approvals ?? []).length;
  const notes = insights(sel);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kick">{today}</div>
          <h1 className="h1">Assalam-o-Alaikum, {me.full_name.split(" ")[0]} sahib</h1>
          <p className="muted text-base">{all.length} campuses · {students.toLocaleString()} students · {pending ? `${pending} waiting for your approval` : "nothing waiting for you"}</p>
        </div>
        <div className="flex gap-2"><Link className="btn-ghost" href="/owner/reports">Download board report</Link><Link className="btn" href="/owner/campuses?new=1">Add a campus</Link></div>
      </div>
      {g.error && <div className="notice-bad">{g.error}</div>}
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      <OwnerFilter base="/owner" sp={sp} all={all} camp={g.camp} period={g.period} />

      <Kpis items={[
        { l: "Students", v: students.toLocaleString(), n: seats ? `${pc(students / seats)} of ${seats.toLocaleString()} seats` : "seats not set" },
        { l: "Billed", v: rs(billed), n: `${g.from} to ${g.to}` },
        { l: "Collected", v: rs(collected), n: billed ? `${pc(Math.min(1, collected / billed))} of billed` : "no challans", c: "#15803d" },
        { l: "Outstanding", v: rs(sum((c) => c.outstanding)), n: `${sum((c) => c.owing_families)} families`, c: "#b91c1c" },
        { l: "Costs", v: rs(costs), n: `salaries ${rs(payroll)}`, c: "#c2410c" },
        { l: "Profit", v: rs(profit), n: collected ? `margin ${pc(profit / collected)}` : "—", c: profit < 0 ? "#b91c1c" : "#15803d" },
        { l: "Attendance", v: marked ? pc(sum((c) => c.att_present) / marked, 1) : "—", n: marked ? `${marked.toLocaleString()} marks` : "not marked" },
        { l: "Results", v: pc(results), n: "average, last exams" },
      ]} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {all.map((c) => (
          <Link key={c.id} href={"/owner" + qs(sp, { c: g.camp === c.id ? "all" : c.id })} className="flex flex-col gap-1.5 rounded-[18px] border-2 bg-white p-3.5"
            style={{ borderColor: g.camp === c.id ? "#7dd3fc" : "#e5e7eb", background: g.camp === c.id ? "#f0f9ff" : "#fff", boxShadow: `0 4px 0 ${g.camp === c.id ? "#7dd3fc" : "#e5e7eb"}` }}>
            <div className="flex items-center justify-between gap-2"><b className="text-[16px]">{c.name}</b><span className={`pill ${c.status === "opening" ? STATUS_TAG.opening : c.profit < 0 && c.collected ? "pill-red" : "pill-green"}`}>{c.status === "opening" ? "Opening" : c.profit < 0 && c.collected ? "Losing money" : "Running"}</span></div>
            <div className="muted text-[13px]">{c.principal ?? "No principal"} · {c.city ?? ""}</div>
            <div className="text-[18px] font-black" style={{ color: c.profit < 0 ? "#b91c1c" : "#15803d" }}>{c.collected || c.costs ? `${rs(c.profit)} profit` : "no money records"}</div>
            <div className="muted text-[12px] font-bold">{c.students} students · Fees {pc(c.colRate)} · Score {c.score ?? "—"}</div>
          </Link>
        ))}
      </div>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Campus comparison</h2>
          <div className="flex flex-wrap gap-1.5">{SORTS.map(([id, l]) => <Link key={id} href={"/owner" + qs(sp, {}) + `&s=${id}`} className={`pill ${sort === id ? "pill-blue" : "pill-gray"}`}>{l}</Link>)}</div></div>
        <div className="overflow-x-auto"><table className="tbl min-w-[980px]">
          <thead><tr><th>#</th><th>Campus</th><th>Principal</th><th>Students</th><th>Seats used</th><th>Billed</th><th>Collected</th><th>Costs</th><th>Profit</th><th>Margin</th><th>Attendance</th><th>Results</th><th>Score</th></tr></thead>
          <tbody>{rows.map((c, i) => (
            <tr key={c.id}><td>{i + 1}</td><td className="font-black">{c.name}</td><td>{c.principal ?? "—"}</td><td>{c.students || "—"}</td><td>{pc(c.fill)}</td><td>{c.billed ? rs(c.billed) : "—"}</td><td>{c.collected ? rs(c.collected) : "—"}</td>
              <td>{c.costs ? rs(c.costs) : "—"}</td><td className="font-black" style={{ color: c.profit < 0 ? "#b91c1c" : "#15803d" }}>{c.collected || c.costs ? rs(c.profit) : "—"}</td><td>{pc(c.margin)}</td><td>{pc(c.att, 1)}</td><td>{pc(c.results)}</td><td className="text-lg font-black">{c.score ?? "—"}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="muted text-xs">Score = results 30% + attendance 20% + fee collection 20% + profit margin 20% + parent satisfaction 10%. Parts with no records yet are left out. Satisfaction comes from praise vs complaints in the complaints box.</p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="card">
          <h2 className="h2">Money in and out · {g.camp === "all" ? "all campuses" : name.get(g.camp)}</h2>
          <div className="flex gap-3 text-xs font-black"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#16a34a]" />Fees collected</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#f97316]" />Expenses and salaries</span></div>
          {M.every((m) => !Number(m.collected) && !Number(m.expenses) && !Number(m.payroll)) ? <p className="muted">No money records in the last six months.</p> : (
            <div className="flex h-48 items-end gap-3">
              {M.map((m) => { const out = Number(m.expenses) + Number(m.payroll); return (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-40 w-full items-end justify-center gap-1">
                    <i title={rs(Number(m.collected))} className="block w-1/3 rounded-t-md bg-[#16a34a]" style={{ height: `${(Number(m.collected) / mx) * 100}%` }} />
                    <i title={rs(out)} className="block w-1/3 rounded-t-md bg-[#f97316]" style={{ height: `${(out / mx) * 100}%` }} />
                  </div>
                  <span className="text-[11px] font-black">{new Date(m.month).toLocaleDateString("en-GB", { month: "short" })}</span>
                  <span className="text-[10px] font-bold" style={{ color: Number(m.collected) - out < 0 ? "#b91c1c" : "#15803d" }}>{rs(Number(m.collected) - out)}</span>
                </div>); })}
            </div>
          )}
        </section>
        <section className="card">
          <h2 className="h2">Where the money goes</h2>
          <HBars items={[...headSum].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ n, v, label: `${rs(v)} · ${pc(v / headTotal)}`, c: n === "Salaries" ? "#0ea5e9" : "#7c3aed" }))} empty="No expenses recorded in this period." />
          <div className="rounded-xl p-3 text-sm font-bold" style={{ background: "#f0fdf4" }}>
            Net cash, last 6 months: <b>{rs(yearCash)}</b>. Salaries still to pay: <b>{rs(due)}</b>{due && yearCash > 0 ? ` · covers ${(yearCash / due).toFixed(1)}× the next payroll.` : "."}
            <div className="muted mt-1 text-xs">Bank balances aren&apos;t recorded in the app; this is fees collected minus spending.</div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between"><h2 className="h2">Waiting for your approval</h2><span className={`pill ${pending ? "pill-red" : "pill-green"}`}>{pending} waiting</span></div>
          {pending === 0 && <p className="muted">Nothing waiting. Principals send requests above their limit from their app.</p>}
          {((approvals ?? []) as unknown as { id: string; kind: string; title: string; detail: string | null; amount_paisa: number | null; monthly: boolean; campus_id: string | null; profiles: { full_name: string } | null }[]).map((a) => (
            <form key={a.id} action={decideApproval} className="flex flex-wrap items-center gap-2.5 border-t-2 py-2.5" style={{ borderColor: "#f1f5f9" }}>
              <input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value={"/owner" + qs(sp, {})} />
              <span className={`ilm-tile ${KIND[a.kind][1]}`}>{KIND[a.kind][0]}</span>
              <div className="min-w-40 flex-1"><div className="font-black">{a.title}</div><div className="muted text-xs">{a.campus_id ? name.get(a.campus_id) : "All campuses"} · {a.profiles?.full_name ?? ""}{a.detail ? ` · ${a.detail}` : ""}</div></div>
              {a.amount_paisa != null && <b className="tabular-nums">{rs(a.amount_paisa)}{a.monthly ? "/mo" : ""}</b>}
              <button className="btn-ghost min-h-10 px-3 text-sm" name="decision" value="decline" type="submit">Decline</button>
              <button className="btn min-h-10 px-3 text-sm" name="decision" value="approve" type="submit">Approve</button>
            </form>
          ))}
          <Link href="/owner/approvals" className="eyebrow">All approvals and the log ›</Link>
        </section>
        <Notes items={notes} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="card">
          <h2 className="h2">Principals scorecard</h2>
          {all.filter((c) => c.principal).map((c) => (
            <div key={c.id} className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e0f2fe] text-xs font-black text-[#0369a1]">{c.principal!.split(" ").filter((w) => !/^dr\.?$/i.test(w)).map((w) => w[0]).slice(0, 2).join("")}</span>
              <div className="min-w-0 flex-1"><div className="truncate font-black">{c.principal}</div><div className="muted text-xs">{c.name} · fees {pc(c.colRate)} · attendance {pc(c.att)}</div></div>
              <b className="text-lg">{c.score ?? "—"}</b>
            </div>
          ))}
          {!all.some((c) => c.principal) && <p className="muted">No principals linked to campuses yet.</p>}
        </section>
        <section className="card">
          <h2 className="h2">Admissions by campus</h2>
          <HBars items={all.filter((c) => c.target).map((c) => ({ n: c.name, v: c.joined / (c.target || 1), label: `${c.joined} of ${c.target}`, c: c.joined >= (c.target ?? 0) * 0.7 ? "#16a34a" : "#f59e0b" }))} empty="Set admission targets in Campuses." />
          <p className="muted text-xs">Joined in this period, of each campus&apos;s target.</p>
        </section>
        <section className="card">
          {opening.length === 0 ? <><h2 className="h2">New campus</h2><p className="muted">No campus is opening. Add one in Campuses to get a readiness checklist.</p></> : opening.map((c) => (
            <div key={c.id} className="flex flex-col gap-1.5">
              <h2 className="h2">New campus · {c.name}</h2><div className="muted text-sm">{c.opened_on ? `Opens ${new Date(c.opened_on).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}` : "Opening date not set"}</div>
              {(checklist ?? []).filter((x) => x.campus_id === c.id).map((x) => (
                <div key={x.id} className="flex justify-between gap-2 text-sm font-bold"><span>{x.item}</span><span className={`pill ${x.status === "done" ? "pill-green" : x.status === "doing" ? "pill-orange" : "pill-gray"}`}>{x.note || x.status}</span></div>
              ))}
              <div className="flex justify-between text-sm font-bold"><span>Admissions</span><span>{c.joined} of {c.target ?? "—"}</span></div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
