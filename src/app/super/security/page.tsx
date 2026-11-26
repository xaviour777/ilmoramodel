import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHead, Stats, Stat, Chips, Empty } from "@/components/ilm";

type A = { at: string; action: string; school: string | null; school_id: string | null; detail: Record<string, unknown> };
type O = { changes_7d: number; people_7d: number; password_resets_30d: number; super_admins: number };

export default async function Security({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [au, ov] = await Promise.all([supabase.rpc("super_audit", { p_limit: 500 }), supabase.rpc("super_overview")]);
  const all = (au.data ?? []) as A[];
  const o = (ov.data ?? {}) as O;
  const f = ["money", "access", "schools"].includes(sp.f ?? "") ? sp.f! : "all";
  const kind = (a: A) => /invoice|billed|plan/.test(a.action) ? "money" : /password|suspend|activ|trial/.test(a.action) ? "access" : "schools";
  const q = (sp.q ?? "").toLowerCase().trim();
  const rows = all.filter((a) => (f === "all" || kind(a) === f) && (!q || [a.action, a.school].some((v) => v?.toLowerCase().includes(q))));
  const href = (x: { f?: string }) => "/super/security?" + new URLSearchParams(Object.entries({ q: sp.q, f: f === "all" ? undefined : f, ...x }).filter(([, v]) => v) as [string, string][]);
  return (
    <>
      <PageHead kick="Safety" title="Security and audit log" sub="Who changed what, and when: schools, trials, passwords, plans and money." />
      {au.error && <div className="notice-bad">{au.error.message}</div>}
      <Stats>
        <Stat label="Changes" value={o.changes_7d ?? 0} sub="from this dashboard, last 7 days" />
        <Stat label="People signed in" value={o.people_7d ?? 0} sub="all schools, last 7 days" />
        <Stat label="Passwords reset" value={o.password_resets_30d ?? 0} sub="for school staff, last 30 days" />
        <Stat label="Super admins" value={o.super_admins ?? 0} tone="#15803d" sub="people with this dashboard" />
      </Stats>
      <div className="flex flex-wrap items-center gap-2.5">
        <form className="flex min-w-[240px] flex-[1_1_300px] gap-2">
          {f !== "all" && <input type="hidden" name="f" value={f} />}
          <input className="input flex-1" name="q" defaultValue={sp.q} placeholder="School or action" aria-label="Search the log" />
          <button className="btn-ghost" type="submit">Search</button>
        </form>
        <Chips label="Filter" current={f} items={[["all", "All"], ["schools", "Schools"], ["access", "Access and trials"], ["money", "Money and plans"]].map(([id, label]) => ({ id, label, href: href({ f: id === "all" ? undefined : id }) }))} />
      </div>
      <section className="card">
        <div className="tbl overflow-x-auto"><table className="w-full min-w-[700px]">
          <thead><tr>{["Time", "School", "What"].map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}>
              <td className="text-[13px] font-bold whitespace-nowrap text-[#6b7280]">{new Date(r.at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
              <td>{r.school_id ? <Link href={`/super/${r.school_id}`} className="font-black text-[#0369a1]">{r.school}</Link> : <span className="muted">platform</span>}</td>
              <td className="font-bold">{r.action}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {rows.length === 0 && <Empty>Nothing recorded yet.</Empty>}
      </section>
    </>
  );
}
