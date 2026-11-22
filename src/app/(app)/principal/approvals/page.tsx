import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { rs } from "@/lib/owner";
import { askApproval } from "@/app/(app)/owner/actions";

const KIND: Record<string, string> = { expense: "Expense", concession: "Fee concession", hiring: "Hiring", payroll: "Payroll", fee_change: "Fee change", other: "Other" };
const PILL: Record<string, string> = { pending: "pill-orange", approved: "pill-green", declined: "pill-gray" };

// A principal or accounts asks the director (owner) for anything above their limit.
export default async function AskOwner({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole("principal", "accountant", "owner");
  const sp = await searchParams;
  const sb = await createClient();
  const [{ data: rows }, { data: limits }] = await Promise.all([
    sb.from("approvals").select("id, kind, title, detail, amount_paisa, status, decision_note, created_at").order("created_at", { ascending: false }).limit(50),
    sb.from("approval_limits").select("kind, role, limit_paisa, note"),
  ]);
  const mine = (limits ?? []).filter((l) => l.role === (me.role === "accountant" ? "accountant" : "principal"));
  return (
    <>
      <div><h1 className="h1">Director requests</h1><p className="muted text-base">Anything above your limit goes to the director for a yes or no.</p></div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}{sp.saved && <div className="notice-ok">Sent to the director.</div>}
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <form action={askApproval} className="card">
          <input type="hidden" name="back" value="/principal/approvals" /><input type="hidden" name="campus_id" value={me.campus_id} />
          <label className="field">Type<select className="input" name="kind">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field">What is it<input className="input" name="title" required placeholder="Science lab equipment" /></label>
          <label className="field">Details<textarea className="input min-h-20 py-2" name="detail" placeholder="Why, quotations, who it is for" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Amount (Rs)<input className="input" type="number" min={0} name="amount" /></label>
            <label className="flex items-end gap-2 pb-3 text-sm font-extrabold"><input type="checkbox" name="monthly" className="h-5 w-5" /> Every month</label>
          </div>
          <button className="btn self-start" type="submit">Send to the director</button>
          {mine.length > 0 && <div className="muted text-xs">Your limits: {mine.map((l) => `${KIND[l.kind]} ${l.limit_paisa != null ? `up to ${rs(Number(l.limit_paisa))}` : l.note ?? "director always"}`).join(" · ")}</div>}
        </form>
        <section className="card">
          <h2 className="h2">Sent</h2>
          {(rows ?? []).length === 0 && <p className="muted">Nothing yet.</p>}
          {(rows ?? []).map((a) => (
            <div key={a.id} className="row-box flex-wrap">
              <div className="min-w-40 flex-1"><div className="font-extrabold">{a.title}</div><div className="muted text-xs">{KIND[a.kind]} · {new Date(a.created_at).toLocaleDateString("en-GB")}{a.decision_note ? ` · ${a.decision_note}` : ""}</div></div>
              {a.amount_paisa != null && <b>{rs(Number(a.amount_paisa))}</b>}
              <span className={`pill ${PILL[a.status]}`}>{a.status}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
