import Link from "next/link";
import { requireRole } from "@/lib/me";
import { insights, loadGroup, pc, rs, type OwnerSearch } from "@/lib/owner";
import { HBars, Kpis, Notes, OwnerFilter, OwnerHead } from "@/components/owner-ui";

export default async function Revenue({ searchParams }: { searchParams: Promise<OwnerSearch> }) {
  await requireRole("owner");
  const sp = await searchParams;
  const g = await loadGroup(sp);
  const one = g.camp === "all" ? null : g.camp;
  const [{ data: months }, { data: aging }, { data: fees }] = await Promise.all([
    g.supabase.rpc("owner_months", { p_campus: one, p_months: 6 }),
    g.supabase.rpc("owner_fee_aging"),
    g.supabase.rpc("owner_fee_structure"),
  ]);
  const ids = new Set(g.sel.map((c) => c.id));
  const billed = g.sum((c) => c.billed), col = g.sum((c) => c.collected), out = g.sum((c) => c.outstanding), online = g.sum((c) => c.online);
  const ag = new Map<string, { f: number; a: number }>();
  for (const r of (aging ?? []) as { campus_id: string; bucket: string; families: number; amount: number }[]) if (ids.has(r.campus_id)) {
    const x = ag.get(r.bucket) ?? { f: 0, a: 0 }; x.f += r.families; x.a += Number(r.amount); ag.set(r.bucket, x);
  }
  type F = { campus_id: string; class_name: string; class_sort: number; monthly: number | null };
  const F = ((fees ?? []) as F[]).filter((f) => ids.has(f.campus_id));
  const classes = [...new Map(F.map((f) => [f.class_name, f.class_sort])).entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);
  const camps = g.sel.filter((c) => F.some((f) => f.campus_id === c.id));
  const notes = insights(g.sel).filter((x) => /collect|owe/.test(x));
  const old = ag.get("4 · over 90 days");
  if (old) notes.push(`${old.f} families owe for over 90 days (${rs(old.a)}). Agree a payment plan before result day.`);
  return (
    <>
      <OwnerHead group="Money" title="Revenue and fees" sub="What each campus billed, collected and is still owed."><Link className="btn" href="/accounts/messages">Send fee reminders</Link></OwnerHead>
      <OwnerFilter base="/owner/revenue" sp={sp} all={g.all} camp={g.camp} period={g.period} />
      <Kpis items={[
        { l: "Billed", v: rs(billed), n: `${g.from} to ${g.to}` },
        { l: "Collected", v: rs(col), n: billed ? `${pc(Math.min(1, col / billed))} of billed` : "—", c: "#15803d" },
        { l: "Outstanding", v: rs(out), n: `${g.sum((c) => c.owing_families)} families`, c: "#b91c1c" },
        { l: "Paid online", v: col ? pc(online / col) : "—", n: "JazzCash, Easypaisa, bank" },
      ]} />
      <section className="card">
        <h2 className="h2">By campus</h2>
        <div className="overflow-x-auto"><table className="tbl min-w-[780px]">
          <thead><tr><th>Campus</th><th>Billed</th><th>Collected</th><th>Outstanding</th><th>Rate</th><th>Online</th><th>Concessions</th></tr></thead>
          <tbody>{g.sel.map((c) => (
            <tr key={c.id}><td className="font-black">{c.name}</td><td>{rs(c.billed)}</td><td>{rs(c.collected)}</td><td>{rs(c.outstanding)}</td>
              <td className="font-black" style={{ color: c.colRate == null ? undefined : c.colRate >= 0.85 ? "#15803d" : "#b91c1c" }}>{pc(c.colRate)}</td><td>{c.collected ? pc(c.online / c.collected) : "—"}</td><td>{rs(c.concessions)}</td></tr>
          ))}
          <tr className="font-black" style={{ borderTop: "3px solid #1f2937" }}><td>Total</td><td>{rs(billed)}</td><td>{rs(col)}</td><td>{rs(out)}</td><td>{billed ? pc(Math.min(1, col / billed)) : "—"}</td><td>{col ? pc(online / col) : "—"}</td><td>{rs(g.sum((c) => c.concessions))}</td></tr>
          </tbody>
        </table></div>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card"><h2 className="h2">Collection by month</h2>
          <HBars items={((months ?? []) as { month: string; collected: number; billed: number }[]).filter((m) => Number(m.billed) || Number(m.collected)).map((m) => {
            const r = Number(m.billed) ? Number(m.collected) / Number(m.billed) : 0;
            return { n: new Date(m.month).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), v: r, label: Number(m.billed) ? pc(r) : rs(Number(m.collected)), c: r >= 0.85 ? "#16a34a" : "#f59e0b" };
          })} empty="No challans in the last six months." />
          <p className="muted text-xs">Fees received in the month ÷ challans for that month.</p></section>
        <section className="card"><h2 className="h2">Outstanding by age</h2>
          {ag.size === 0 ? <p className="muted">Nobody owes anything.</p> : (
            <table className="tbl"><thead><tr><th>Unpaid for</th><th>Families</th><th>Amount</th></tr></thead>
              <tbody>{[...ag].sort().map(([b, x]) => <tr key={b}><td className={b.startsWith("4") ? "font-black text-[#b91c1c]" : ""}>{b.slice(4)}</td><td>{x.f}</td><td>{rs(x.a)}</td></tr>)}</tbody></table>
          )}</section>
        <section className="card xl:col-span-2"><h2 className="h2">Fee structure · monthly fee per class</h2>
          {classes.length === 0 ? <p className="muted">No fee structure set up yet.</p> : (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Class</th>{camps.map((c) => <th key={c.id}>{c.name}</th>)}</tr></thead>
              <tbody>{classes.map((k) => <tr key={k}><td className="font-black">{k}</td>{camps.map((c) => { const f = F.find((x) => x.campus_id === c.id && x.class_name === k); return <td key={c.id}>{f?.monthly ? rs(f.monthly) : "—"}</td>; })}</tr>)}</tbody></table></div>
          )}</section>
      </div>
      <Notes title="AI · more money in" items={notes} />
    </>
  );
}
