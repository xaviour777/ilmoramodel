import Link from "next/link";
import { requireRole } from "@/lib/me";
import { loadGroup, rs } from "@/lib/owner";
import { OwnerHead, STATUS_TAG } from "@/components/owner-ui";
import { saveBranding, saveGroupSettings, saveLimits } from "../actions";

const KINDS: [string, string][] = [["expense", "Expense"], ["concession", "Fee concession"], ["hiring", "Hiring"], ["payroll", "Payroll"], ["fee_change", "Fee change"], ["other", "Other"]];
const ROLES: [string, string, string][] = [
  ["Owner", "Everything in every campus", "Approvals, group settings, all reports"],
  ["Principal", "Their own campus", "Students, staff, exams, fees, requests to the owner"],
  ["Accounts", "Their own campus", "Fee desk, challans, expenses, salaries"],
  ["Teacher", "Their classes", "Attendance, homework, marks, diary"],
  ["Parent / student", "Their own children", "Fees, results, homework, requests"],
];

export default async function GroupSettings({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("owner");
  const sp = await searchParams;
  const g = await loadGroup({});
  const [{ data: limits }, { data: gs }, { data: school }] = await Promise.all([
    g.supabase.from("approval_limits").select("kind, role, limit_paisa, note"),
    g.supabase.from("group_settings").select("*").maybeSingle(),
    g.supabase.from("schools").select("name, primary_color, logo_url, support_email, plan, custom_domain").maybeSingle(),
  ]);
  const lim = (k: string, r: string) => (limits ?? []).find((l) => l.kind === k && l.role === r);
  const back = "/owner/settings";
  return (
    <>
      <OwnerHead group="Admin" title="Group settings" sub="Rules that apply to every campus." />
      {sp.error && <div className="notice-bad">{sp.error}</div>}{sp.saved && <div className="notice-ok">Saved.</div>}
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <div className="flex items-center justify-between"><h2 className="h2">Campuses</h2><Link className="btn-ghost min-h-10 px-3 text-sm" href="/owner/campuses?new=1">Add a campus</Link></div>
          {g.all.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 border-t-2 py-2 text-sm font-bold" style={{ borderColor: "#f1f5f9" }}>
              <span>{c.name} · {c.principal ?? "no principal"}</span>
              <span className="flex items-center gap-2"><span className={`pill ${STATUS_TAG[c.status]}`}>{c.status}</span><Link className="underline" href={`/owner/campuses?edit=${c.id}`}>Edit</Link></span>
            </div>
          ))}
        </section>
        <form action={saveBranding} className="card">
          <input type="hidden" name="back" value={back} />
          <h2 className="h2">Branding</h2>
          <label className="field">School / group name<input className="input" name="name" required defaultValue={school?.name ?? ""} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Colour<input className="input" type="color" name="color" defaultValue={school?.primary_color ?? "#16a34a"} /></label>
            <label className="field">Support email<input className="input" name="email" defaultValue={school?.support_email ?? ""} /></label>
          </div>
          <label className="field">Logo link<input className="input" name="logo" defaultValue={school?.logo_url ?? ""} placeholder="https://…" /></label>
          <button className="btn self-start" type="submit">Save branding</button>
          {school?.custom_domain && <p className="muted text-xs">Your app address: {school.custom_domain}</p>}
        </form>
      </div>

      <form action={saveLimits} id="limits" className="card">
        <input type="hidden" name="back" value={back} />
        <h2 className="h2">Approval limits</h2>
        <p className="muted text-sm">Up to this amount a principal or accounts can go ahead; above it, the request comes to you. Leave empty for &quot;always ask the owner&quot;.</p>
        <div className="overflow-x-auto"><table className="tbl min-w-[640px]"><thead><tr><th>Request</th><th>Principal up to (Rs)</th><th>Accounts up to (Rs)</th><th>Note</th></tr></thead>
          <tbody>{KINDS.map(([k, l]) => (
            <tr key={k}><td className="font-black">{l}</td>
              {["principal", "accountant"].map((r) => <td key={r}><input className="input w-36" type="number" min={0} name={`${k}:${r}`} defaultValue={lim(k, r)?.limit_paisa != null ? Number(lim(k, r)!.limit_paisa) / 100 : ""} placeholder="owner" /></td>)}
              <td><input className="input" name={`${k}:principal:note`} defaultValue={lim(k, "principal")?.note ?? ""} /></td></tr>
          ))}</tbody></table></div>
        <button className="btn self-start" type="submit">Save limits</button>
      </form>

      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <form action={saveGroupSettings} className="card">
          <input type="hidden" name="back" value={back} />
          <h2 className="h2">Fee policy and AI budget</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Fee due day<input className="input" type="number" min={1} max={28} name="due_day" defaultValue={gs?.due_day ?? 10} /></label>
            <label className="field">Late fee (Rs)<input className="input" type="number" min={0} name="late_fee" defaultValue={gs ? Number(gs.late_fee_paisa) / 100 : 0} /></label>
            <label className="field">Sibling discount %<input className="input" type="number" min={0} max={100} step="0.5" name="sibling" defaultValue={gs?.sibling_discount_pct ?? 0} /></label>
            <label className="field">Most concession a principal gives %<input className="input" type="number" min={0} max={100} name="max_concession" defaultValue={gs?.max_concession_pct ?? 10} /></label>
            <label className="field">Hold result card after (days unpaid)<input className="input" type="number" min={0} name="hold_days" defaultValue={gs?.hold_results_days ?? ""} /></label>
            <label className="field">AI budget per month (Rs)<input className="input" type="number" min={0} name="ai_budget" defaultValue={gs?.ai_monthly_budget_paisa != null ? Number(gs.ai_monthly_budget_paisa) / 100 : ""} /></label>
          </div>
          <button className="btn self-start" type="submit">Save policy</button>
          <p className="muted text-xs">These are the group&apos;s rules for principals and accounts to follow. Each campus&apos;s fee amounts and AI daily limit are still set in that campus&apos;s settings.{gs?.ai_monthly_budget_paisa ? ` Budget: ${rs(Number(gs.ai_monthly_budget_paisa))}.` : ""}</p>
        </form>
        <div className="flex flex-col gap-5">
          <section className="card">
            <h2 className="h2">Payments</h2>
            <p className="muted text-sm">Wallet accounts parents pay into (JazzCash, Easypaisa, bank) are set per campus.</p>
            <div className="flex flex-wrap gap-2"><Link className="btn-ghost min-h-10 px-3 text-sm" href="/accounts/online">Online payments</Link><Link className="btn-ghost min-h-10 px-3 text-sm" href="/settings">WhatsApp and SMS</Link></div>
          </section>
          <section className="card">
            <h2 className="h2">Roles</h2>
            <table className="tbl"><thead><tr><th>Role</th><th>Sees</th><th>Can do</th></tr></thead>
              <tbody>{ROLES.map(([r, s, d]) => <tr key={r}><td className="font-black">{r}</td><td>{s}</td><td>{d}</td></tr>)}</tbody></table>
            <Link className="eyebrow" href="/owner/people">See everyone ›</Link>
          </section>
        </div>
      </div>
    </>
  );
}
