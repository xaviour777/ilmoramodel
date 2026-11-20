import { requireRole } from "@/lib/me";
import { loadGroup, pc, type OwnerSearch } from "@/lib/owner";
import { Kpis, OwnerFilter, OwnerHead } from "@/components/owner-ui";

const ROLE: Record<string, string> = { owner: "Owner", principal: "Principal", accountant: "Accounts", teacher: "Teacher" };

export default async function People({ searchParams }: { searchParams: Promise<OwnerSearch> }) {
  await requireRole("owner");
  const sp = await searchParams;
  const g = await loadGroup(sp);
  const [{ data: staff }, { data: obs }] = await Promise.all([
    g.supabase.rpc("owner_staff"),
    g.supabase.from("observations").select("teacher_id, planning, delivery, engagement, discipline"),
  ]);
  const ids = new Set(g.sel.map((c) => c.id));
  const S = ((staff ?? []) as { id: string; campus_id: string; full_name: string; role: string; phone: string | null; is_active: boolean }[]).filter((p) => ids.has(p.campus_id) && p.is_active);
  const name = new Map(g.all.map((c) => [c.id, c.name]));
  const teachers = S.filter((p) => p.role === "teacher").length, stu = g.sum((c) => c.students);
  const obsAvg = (obs ?? []).length ? (obs ?? []).reduce((t, o) => t + [o.planning, o.delivery, o.engagement, o.discipline].filter((x) => x != null).reduce((a, b) => a + b!, 0) / 4, 0) / (obs ?? []).length : null;
  return (
    <>
      <OwnerHead group="School" title="Principals and staff" sub="Who runs each campus and how they are doing." />
      <OwnerFilter base="/owner/people" sp={sp} all={g.all} camp={g.camp} period={g.period} />
      <Kpis items={[
        { l: "Staff", v: S.length, n: `${teachers} teachers` },
        { l: "Students per teacher", v: teachers ? (stu / teachers).toFixed(1) : "—", n: "group average" },
        { l: "Principals", v: S.filter((p) => p.role === "principal").length, n: `${g.sel.filter((c) => !c.principal).length} campuses without` },
        { l: "Lesson observations", v: (obs ?? []).length, n: obsAvg != null ? `average ${obsAvg.toFixed(1)}/5` : "none yet" },
      ]} />
      <section className="card"><h2 className="h2">Principals scorecard</h2>
        <div className="overflow-x-auto"><table className="tbl min-w-[720px]"><thead><tr><th>Principal</th><th>Campus</th><th>Students</th><th>Attendance</th><th>Results</th><th>Fee collection</th><th>Margin</th><th>Score</th></tr></thead>
          <tbody>{g.sel.map((c) => <tr key={c.id}><td className="font-black">{c.principal ?? "—"}</td><td>{c.name}</td><td>{c.students}</td><td>{pc(c.att, 1)}</td><td>{pc(c.results)}</td><td>{pc(c.colRate)}</td><td>{pc(c.margin)}</td><td className="text-lg font-black">{c.score ?? "—"}</td></tr>)}</tbody></table></div>
        <p className="muted text-xs">A principal&apos;s score is their campus score.</p></section>
      <section className="card"><h2 className="h2">Staff by campus</h2>
        <div className="overflow-x-auto"><table className="tbl min-w-[640px]"><thead><tr><th>Campus</th>{["principal", "accountant", "teacher"].map((r) => <th key={r}>{ROLE[r]}s</th>)}<th>Students per teacher</th></tr></thead>
          <tbody>{g.sel.map((c) => { const p = S.filter((x) => x.campus_id === c.id); const t = p.filter((x) => x.role === "teacher").length; return (
            <tr key={c.id}><td className="font-black">{c.name}</td>{["principal", "accountant", "teacher"].map((r) => <td key={r}>{p.filter((x) => x.role === r).length}</td>)}<td>{t ? (c.students / t).toFixed(1) : "—"}</td></tr>); })}</tbody></table></div></section>
      <section className="card"><h2 className="h2">Everyone</h2>
        <div className="overflow-x-auto"><table className="tbl min-w-[560px]"><thead><tr><th>Name</th><th>Role</th><th>Campus</th><th>Phone</th></tr></thead>
          <tbody>{S.sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name)).map((p) => <tr key={p.id}><td className="font-bold">{p.full_name}</td><td>{ROLE[p.role]}</td><td>{name.get(p.campus_id)}</td><td>{p.phone ?? "—"}</td></tr>)}</tbody></table></div></section>
    </>
  );
}
