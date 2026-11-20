import Link from "next/link";
import { requireRole } from "@/lib/me";
import { loadGroup, pc, type OwnerSearch } from "@/lib/owner";
import { HBars, Kpis, Notes, OwnerFilter, OwnerHead } from "@/components/owner-ui";

export default async function Academics({ searchParams }: { searchParams: Promise<OwnerSearch> }) {
  await requireRole("owner");
  const sp = await searchParams;
  const g = await loadGroup(sp);
  const { data } = await g.supabase.rpc("owner_academics", { p_from: g.from, p_to: g.to });
  const A = (data ?? { subjects: [], sections: [], top: 0 }) as { subjects: { campus_id: string; subject: string; avg: number; n: number }[]; sections: { campus_id: string; section: string; avg: number; weak: string }[]; top: number };
  const ids = new Set(g.sel.map((c) => c.id));
  const subj = new Map<string, { s: number; n: number }>();
  for (const x of A.subjects.filter((x) => ids.has(x.campus_id))) { const v = subj.get(x.subject) ?? { s: 0, n: 0 }; v.s += x.avg * x.n; v.n += x.n; subj.set(x.subject, v); }
  const secs = A.sections.filter((x) => ids.has(x.campus_id)).sort((a, b) => a.avg - b.avg);
  const name = new Map(g.all.map((c) => [c.id, c.name]));
  const res = g.sel.filter((c) => c.results != null), marked = g.sum((c) => c.att_marked);
  const avg = (f: (c: (typeof res)[number]) => number) => (res.length ? res.reduce((t, c) => t + f(c), 0) / res.length : null);
  const subjects = [...subj].map(([n, v]) => ({ n, v: v.s / v.n })).sort((a, b) => a.v - b.v);
  const notes: string[] = [];
  if (subjects[0]) notes.push(`${subjects[0].n} is the weakest subject across ${g.camp === "all" ? "the group" : "this campus"} at ${pc(subjects[0].v)}.`);
  const best = [...res].sort((a, b) => Number(b.results) - Number(a.results));
  if (best.length > 1) notes.push(`${best[0].name} leads results at ${pc(best[0].results)}; ${best.at(-1)!.name} is at ${pc(best.at(-1)!.results)}. Share what works.`);
  for (const s of secs.slice(0, 2)) if (s.avg < 0.5) notes.push(`${name.get(s.campus_id)} · ${s.section} averages ${pc(s.avg)}, weakest in ${s.weak}.`);
  return (
    <>
      <OwnerHead group="School" title="Academics" sub="Results and attendance across campuses. Results use exams held up to four months before the period."><Link className="btn-ghost" href="/principal/exams">Open exams</Link></OwnerHead>
      <OwnerFilter base="/owner/academics" sp={sp} all={g.all} camp={g.camp} period={g.period} />
      <Kpis items={[
        { l: "Average result", v: pc(avg((c) => Number(c.results))), n: "all marked subjects" },
        { l: "Pass rate", v: pc(avg((c) => Number(c.pass))), n: "students at 40%+", c: "#15803d" },
        { l: "Attendance", v: marked ? pc(g.sum((c) => c.att_present) / marked, 1) : "—", n: "goal 90%" },
        { l: "A+ students", v: A.top, n: "80% or more" },
      ]} />
      <section className="card"><h2 className="h2">By campus</h2>
        <div className="overflow-x-auto"><table className="tbl min-w-[640px]"><thead><tr><th>Campus</th><th>Students</th><th>Attendance</th><th>Average result</th><th>Pass</th></tr></thead>
          <tbody>{g.sel.map((c) => <tr key={c.id}><td className="font-black">{c.name}</td><td>{c.students || "—"}</td><td>{pc(c.att, 1)}</td><td>{pc(c.results)}</td><td>{pc(c.pass)}</td></tr>)}</tbody></table></div></section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card"><h2 className="h2">Subject average</h2>
          <HBars items={[...subjects].reverse().map((s) => ({ n: s.n, v: s.v, label: pc(s.v), c: s.v < 0.5 ? "#ef4444" : s.v < 0.65 ? "#f59e0b" : "#16a34a" }))} empty="No marks entered yet." /></section>
        <section className="card"><h2 className="h2">Weakest sections</h2>
          {secs.length === 0 ? <p className="muted">No marks yet.</p> : secs.slice(0, 6).map((s) => (
            <div key={s.campus_id + s.section} className="flex justify-between gap-2 border-t-2 py-1.5 text-sm font-bold" style={{ borderColor: "#f1f5f9" }}>
              <span>{name.get(s.campus_id)} · {s.section}</span><span>{pc(s.avg)} · weakest {s.weak}</span></div>
          ))}</section>
      </div>
      <Notes title="AI · share what works" items={notes} />
    </>
  );
}
