import Link from "next/link";
import { requireRole } from "@/lib/me";
import { insights, loadGroup, pc, qs, type OwnerSearch } from "@/lib/owner";
import { HBars, Kpis, Notes, OwnerFilter, OwnerHead, STATUS_TAG } from "@/components/owner-ui";
import { saveCampus, saveChecklist } from "../actions";

type Search = OwnerSearch & { edit?: string; new?: string; saved?: string; error?: string };

export default async function Campuses({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("owner");
  const sp = await searchParams;
  const g = await loadGroup(sp);
  const [{ data: staff }, { data: list }] = await Promise.all([
    g.supabase.rpc("owner_staff"),
    g.supabase.from("campus_checklist").select("id, campus_id, item, status, note, sort").order("sort"),
  ]);
  const principals = ((staff ?? []) as { id: string; full_name: string; role: string; campus_id: string }[]).filter((p) => p.role === "principal");
  const edit = g.all.find((c) => c.id === sp.edit);
  const showForm = !!edit || !!sp.new;
  const back = "/owner/campuses" + qs(sp, {});
  const running = g.all.filter((c) => c.status === "running").length;
  const stu = g.sum((c) => c.students), seats = g.sum((c) => c.seats ?? 0), st = g.sum((c) => c.staff);
  return (
    <>
      <OwnerHead group="Group" title="Campuses" sub="Every campus, its principal, size and status."><Link className="btn" href="/owner/campuses?new=1">Add a campus</Link></OwnerHead>
      {sp.error && <div className="notice-bad">{sp.error}</div>}{sp.saved && <div className="notice-ok">Saved.</div>}
      <OwnerFilter base="/owner/campuses" sp={sp} all={g.all} camp={g.camp} period={g.period} />
      <Kpis items={[
        { l: "Campuses", v: g.sel.length, n: `${running} running · ${g.all.length - running} opening` },
        { l: "Students", v: stu.toLocaleString(), n: `of ${seats.toLocaleString()} seats` },
        { l: "Seats used", v: seats ? pc(stu / seats) : "—", n: `${Math.max(0, seats - stu)} empty seats`, c: seats && stu / seats < 0.7 ? "#c2410c" : undefined },
        { l: "Staff", v: st, n: g.sel.length ? `${Math.round(st / g.sel.length)} per campus` : "" },
      ]} />
      {showForm && (
        <form action={saveCampus} className="card">
          <input type="hidden" name="id" value={edit?.id ?? ""} /><input type="hidden" name="back" value="/owner/campuses" />
          <h2 className="h2">{edit ? `Edit ${edit.name}` : "Add a campus"}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="field">Name<input className="input" name="name" required defaultValue={edit?.name ?? ""} /></label>
            <label className="field">City / area<input className="input" name="city" defaultValue={edit?.city ?? ""} /></label>
            <label className="field">Status<select className="input" name="status" defaultValue={edit?.status ?? "opening"}><option value="running">Running</option><option value="opening">Opening</option></select></label>
            <label className="field">Opened / opens on<input className="input" type="date" name="opened_on" defaultValue={edit?.opened_on ?? ""} /></label>
            <label className="field">Seat capacity<input className="input" type="number" name="seats" defaultValue={edit?.seats ?? ""} /></label>
            <label className="field">Admissions target<input className="input" type="number" name="target" defaultValue={edit?.target ?? ""} /></label>
            <label className="field sm:col-span-3">Principal<select className="input" name="principal_id" defaultValue={edit?.principal_id ?? ""}><option value="">Not chosen</option>{principals.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {g.all.find((c) => c.id === p.campus_id)?.name}</option>)}</select></label>
          </div>
          <div className="flex gap-2"><button className="btn" type="submit">Save</button><Link className="btn-ghost" href="/owner/campuses">Cancel</Link></div>
          {!edit && <p className="muted text-xs">A new campus starts with an empty readiness checklist. Its principal logs in with their own account once added on that campus.</p>}
        </form>
      )}
      <section className="card">
        <h2 className="h2">All campuses</h2>
        <div className="overflow-x-auto"><table className="tbl min-w-[900px]">
          <thead><tr><th>Campus</th><th>City</th><th>Principal</th><th>Opened</th><th>Students</th><th>Sections</th><th>Staff</th><th>Status</th><th /></tr></thead>
          <tbody>{g.sel.map((c) => (
            <tr key={c.id}><td className="font-black">{c.name}</td><td>{c.city ?? "—"}</td><td>{c.principal ?? "—"}</td><td>{c.opened_on ?? "—"}</td><td>{c.students} / {c.seats ?? "—"}</td><td>{c.sections || "—"}</td><td>{c.staff}</td>
              <td><span className={`pill ${STATUS_TAG[c.status]}`}>{c.status}</span></td><td><Link className="underline" href={`/owner/campuses?edit=${c.id}`}>Edit</Link></td></tr>
          ))}</tbody>
        </table></div>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card"><h2 className="h2">Seats used by campus</h2>
          <HBars items={g.sel.map((c) => ({ n: c.name, v: c.fill ?? 0, label: c.status === "opening" ? "opening" : `${c.students} / ${c.seats ?? "—"}`, c: c.status === "opening" ? "#c4b5fd" : (c.fill ?? 0) < 0.65 ? "#f59e0b" : "#0ea5e9" }))} /></section>
        <Notes title="AI · campus notes" items={insights(g.sel)} />
      </div>
      {g.sel.filter((c) => (list ?? []).some((x) => x.campus_id === c.id)).map((c) => (
        <section key={c.id} className="card">
          <h2 className="h2">Readiness checklist · {c.name}</h2>
          {(list ?? []).filter((x) => x.campus_id === c.id).map((x) => (
            <form key={x.id} action={saveChecklist} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={x.id} /><input type="hidden" name="back" value={back} />
              <span className="min-w-40 flex-1 font-extrabold">{x.item}</span>
              <input className="input w-48" name="note" defaultValue={x.note ?? ""} placeholder="Note" />
              <select className="input w-auto" name="status" defaultValue={x.status}><option value="todo">To do</option><option value="doing">In progress</option><option value="done">Done</option></select>
              <button className="btn-ghost min-h-10 px-3 text-sm" type="submit">Save</button>
            </form>
          ))}
        </section>
      ))}
    </>
  );
}
