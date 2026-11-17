import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { stateOf, type SchoolRow } from "@/lib/super";
import { todayPK, shortDate } from "@/lib/format";
import { PageHead, Stats, Stat, Chips, Empty } from "@/components/ilm";

type Search = { q?: string; f?: string; sort?: string; error?: string };

export default async function SuperSchools({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const { data, error } = await supabase.rpc("super_schools");
  const all = ((data ?? []) as SchoolRow[]).map((s) => ({ ...s, st: stateOf(s, today) }));
  const filter = ["trial", "active", "expired", "suspended", "ending", "quiet"].includes(sp.f ?? "") ? sp.f! : "all";
  const weekAhead = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.parse(today) - 14 * 86400000).toISOString();
  const quiet = (s: SchoolRow) => !s.last_login || s.last_login < monthAgo;
  const q = (sp.q ?? "").toLowerCase().trim();
  let list = all.filter((s) => filter === "all" || (filter === "ending" ? s.st.id === "trial" && !!s.trial_ends_on && s.trial_ends_on <= weekAhead : filter === "quiet" ? quiet(s) : s.st.id === filter));
  if (q) list = list.filter((s) => [s.name, s.city, s.custom_domain, s.principal].some((v) => v?.toLowerCase().includes(q)));
  const sort = ["new", "name", "students", "login"].includes(sp.sort ?? "") ? sp.sort! : "new";
  list = [...list].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "students" ? b.students - a.students
    : sort === "login" ? (a.last_login ?? "").localeCompare(b.last_login ?? "") : b.created_at.localeCompare(a.created_at));
  const n = (id: string) => all.filter((s) => s.st.id === id).length;
  const href = (o: Partial<Search>) => "/super?" + new URLSearchParams(Object.entries({ q: sp.q, f: filter === "all" ? undefined : filter, sort, ...o }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <PageHead kick="Platform" title="Schools" sub="Every school on Ilmora: trials, status, domains and how much each one uses the app.">
        <Link href="/super/new" className="btn">Add school</Link>
      </PageHead>
      {(error || sp.error) && <div className="notice-bad">{sp.error ?? error?.message}</div>}
      <Stats>
        <Stat label="Schools" value={all.length} sub={`${all.reduce((t, s) => t + s.campuses, 0)} campuses`} />
        <Stat label="Active" value={n("active")} tone="#15803d" sub="paying or free" />
        <Stat label="On trial" value={n("trial")} tone="#c2410c" sub={`${all.filter((s) => s.st.id === "trial" && s.trial_ends_on && s.trial_ends_on <= weekAhead).length} end this week`} href={href({ f: "ending" })} />
        <Stat label="Trial ended / suspended" value={n("expired") + n("suspended")} tone={n("expired") + n("suspended") ? "#b91c1c" : undefined} sub="can't use the app" />
        <Stat label="Students" value={all.reduce((t, s) => t + s.students, 0).toLocaleString("en-IN")} sub="enrolled, all schools" />
      </Stats>
      <div className="flex flex-wrap items-center gap-2.5">
        <form className="flex min-w-[240px] flex-[1_1_300px] gap-2">
          {filter !== "all" && <input type="hidden" name="f" value={filter} />}<input type="hidden" name="sort" value={sort} />
          <input className="input flex-1" name="q" defaultValue={sp.q} placeholder="School, city, domain or principal" aria-label="Search schools" />
          <button className="btn-ghost" type="submit">Search</button>
        </form>
        <Chips label="Filter" current={filter} items={[["all", "All"], ["active", "Active"], ["trial", "Trial"], ["ending", "Trial ends this week"], ["expired", "Trial ended"], ["suspended", "Suspended"], ["quiet", "No login 14 days"]]
          .map(([id, label]) => ({ id, label, href: href({ f: id === "all" ? undefined : id }) }))} />
      </div>
      <section className="card">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="muted text-[13px]">{list.length} of {all.length} schools</span>
          <Chips label="Sort" current={sort} items={[["new", "Newest"], ["name", "Name"], ["students", "Most students"], ["login", "Least recent login"]].map(([id, label]) => ({ id, label, href: href({ sort: id }) }))} />
        </div>
        <div className="tbl overflow-x-auto"><table className="w-full min-w-[820px]">
          <thead><tr>{["School", "Domain", "Status", "Students", "Staff", "Principal", "Last login"].map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
          <tbody>{list.map((s) => (
            <tr key={s.id}>
              <td><Link href={`/super/${s.id}`} className="flex items-center gap-2.5 font-black text-[#0369a1]">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] text-[14px] font-black text-white" style={{ background: s.primary_color ?? "#16a34a" }}>{s.name[0]}</span>
                <span>{s.name}<span className="muted block text-[12px]">{s.city ?? ""}{s.campuses > 1 ? ` · ${s.campuses} campuses` : ""}</span></span></Link></td>
              <td className="text-[13px]">{s.custom_domain ?? <span className="muted">not set</span>}</td>
              <td><span className={`tagx ${s.st.tone}`}>{s.st.label}</span></td>
              <td className="tabular-nums">{s.students.toLocaleString("en-IN")}{s.max_students ? <span className="muted"> / {s.max_students}</span> : ""}</td>
              <td className="tabular-nums">{s.staff}</td>
              <td className="text-[13px]">{s.principal ?? <span className="muted">none</span>}</td>
              <td className="text-[13px]">{s.last_login ? shortDate(s.last_login.slice(0, 10)) : <span className="muted">never</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        {list.length === 0 && <Empty>No school matches.</Empty>}
      </section>
    </>
  );
}
