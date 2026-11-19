import Link from "next/link";
import { requireRole } from "@/lib/me";
import { loadGroup, qs, rs, type OwnerSearch } from "@/lib/owner";
import { Kpis, OwnerFilter, OwnerHead } from "@/components/owner-ui";
import { askApproval, decideApproval } from "../actions";

type Search = OwnerSearch & { saved?: string; error?: string };
const KIND: Record<string, string> = { payroll: "Payroll", concession: "Fee concession", expense: "Expense", hiring: "Hiring", fee_change: "Fee change", other: "Other" };

export default async function Approvals({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("owner");
  const sp = await searchParams;
  const g = await loadGroup(sp);
  const [{ data: rows }, { data: limits }] = await Promise.all([
    g.supabase.from("approvals").select("id, kind, title, detail, amount_paisa, monthly, status, campus_id, created_at, decided_at, decision_note, req:profiles!approvals_requested_by_fkey(full_name), dec:profiles!approvals_decided_by_fkey(full_name)").order("created_at", { ascending: false }).limit(300),
    g.supabase.from("approval_limits").select("kind, role, limit_paisa, note"),
  ]);
  type A = { id: string; kind: string; title: string; detail: string | null; amount_paisa: number | null; monthly: boolean; status: string; campus_id: string | null; created_at: string; decided_at: string | null; decision_note: string | null; req: { full_name: string } | null; dec: { full_name: string } | null };
  const ids = new Set(g.sel.map((c) => c.id));
  const all = ((rows ?? []) as unknown as A[]).filter((a) => g.camp === "all" || a.campus_id == null || ids.has(a.campus_id));
  const inRange = (a: A) => (a.decided_at ?? a.created_at).slice(0, 10) >= g.from;
  const pending = all.filter((a) => a.status === "pending");
  const ok = all.filter((a) => a.status === "approved" && inRange(a)), no = all.filter((a) => a.status === "declined" && inRange(a));
  const waits = all.filter((a) => a.decided_at).map((a) => (Date.parse(a.decided_at!) - Date.parse(a.created_at)) / 864e5);
  const name = new Map(g.all.map((c) => [c.id, c.name]));
  const back = "/owner/approvals" + qs(sp, {});
  const amt = (xs: A[]) => rs(xs.reduce((t, a) => t + Number(a.amount_paisa ?? 0), 0));
  return (
    <>
      <OwnerHead group="Group" title="Approvals" sub="Anything above a principal's limit comes here. Approve or decline in one tap."><Link className="btn-ghost" href="/owner/settings#limits">Approval limits</Link></OwnerHead>
      {sp.error && <div className="notice-bad">{sp.error}</div>}{sp.saved && <div className="notice-ok">Saved.</div>}
      <OwnerFilter base="/owner/approvals" sp={sp} all={g.all} camp={g.camp} period={g.period} />
      <Kpis items={[
        { l: "Waiting", v: pending.length, n: "for you", c: pending.length ? "#b91c1c" : "#15803d" },
        { l: "Approved", v: ok.length, n: amt(ok) },
        { l: "Declined", v: no.length, n: amt(no) },
        { l: "Average wait", v: waits.length ? `${(waits.reduce((a, b) => a + b, 0) / waits.length).toFixed(1)} days` : "—", n: "goal: same day" },
      ]} />
      <section className="card">
        <h2 className="h2">Waiting for you</h2>
        {pending.length === 0 && <p className="muted">Nothing waiting.</p>}
        {pending.map((a) => (
          <form key={a.id} action={decideApproval} className="flex flex-wrap items-center gap-2.5 border-t-2 py-2.5" style={{ borderColor: "#f1f5f9" }}>
            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value={back} />
            <div className="min-w-48 flex-1"><div className="font-black">{a.title}</div><div className="muted text-xs">{KIND[a.kind]} · {a.campus_id ? name.get(a.campus_id) : "All campuses"} · {a.req?.full_name ?? ""} · {new Date(a.created_at).toLocaleDateString("en-GB")}{a.detail ? ` · ${a.detail}` : ""}</div></div>
            {a.amount_paisa != null && <b>{rs(a.amount_paisa)}{a.monthly ? "/mo" : ""}</b>}
            <input className="input w-40" name="note" placeholder="Note (optional)" />
            <button className="btn-ghost min-h-10 px-3 text-sm" name="decision" value="decline" type="submit">Decline</button>
            <button className="btn min-h-10 px-3 text-sm" name="decision" value="approve" type="submit">Approve</button>
          </form>
        ))}
      </section>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr] xl:items-start">
        <section className="card">
          <h2 className="h2">Decision log</h2>
          <div className="overflow-x-auto"><table className="tbl min-w-[640px]">
            <thead><tr><th>Date</th><th>Campus</th><th>Request</th><th>Amount</th><th>Asked by</th><th>Decision</th></tr></thead>
            <tbody>{all.filter((a) => a.status !== "pending").map((a) => (
              <tr key={a.id}><td>{new Date(a.decided_at ?? a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td><td>{a.campus_id ? name.get(a.campus_id) : "All"}</td><td>{a.title}{a.decision_note ? <div className="muted text-xs">{a.decision_note}</div> : null}</td>
                <td>{a.amount_paisa != null ? rs(a.amount_paisa) : "—"}</td><td>{a.req?.full_name ?? "—"}</td><td><span className={`pill ${a.status === "approved" ? "pill-green" : "pill-gray"}`}>{a.status}</span></td></tr>
            ))}</tbody>
          </table></div>
          {all.every((a) => a.status === "pending") && <p className="muted">No decisions yet.</p>}
        </section>
        <div className="flex flex-col gap-5">
          <section className="card">
            <h2 className="h2">Who can approve what</h2>
            {(limits ?? []).length === 0 ? <p className="muted">No limits set. Everything comes to you.</p> : (
              <table className="tbl"><thead><tr><th>Request</th><th>Role</th><th>Up to</th></tr></thead>
                <tbody>{(limits ?? []).map((l) => <tr key={l.kind + l.role}><td>{KIND[l.kind]}</td><td>{l.role}</td><td>{l.limit_paisa != null ? rs(l.limit_paisa) : l.note ?? "Owner always"}</td></tr>)}</tbody></table>
            )}
            <Link className="eyebrow" href="/owner/settings#limits">Change limits ›</Link>
          </section>
          <form action={askApproval} className="card">
            <input type="hidden" name="back" value={back} />
            <h2 className="h2">Record a request</h2>
            <p className="muted text-xs">For something asked by phone or in person, so it is in the log.</p>
            <label className="field">Type<select className="input" name="kind">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field">Campus<select className="input" name="campus_id"><option value="">All campuses</option>{g.all.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="field">What<input className="input" name="title" required /></label>
            <label className="field">Amount (Rs)<input className="input" type="number" name="amount" /></label>
            <button className="btn self-start" type="submit">Add</button>
          </form>
        </div>
      </div>
    </>
  );
}
