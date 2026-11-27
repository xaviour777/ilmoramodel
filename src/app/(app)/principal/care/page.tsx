import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { rupees, shortDate, todayPK } from "@/lib/format";
import { Tabs } from "@/components/tabs";
import { assignVan, markTrip, replyFeedback, saveVan } from "./actions";

type Search = { tab?: string; van?: string; saved?: string; error?: string };
const STATUS: Record<string, string> = { open: "pill-orange", in_progress: "pill-blue", resolved: "pill-green" };

// Complaints box and school vans.
export default async function Care({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("principal", "owner");
  const sp = await searchParams;
  const sb = await createClient();
  const tab = ["feedback", "transport"].includes(sp.tab ?? "") ? sp.tab! : "feedback";
  const today = todayPK();

  let body: React.ReactNode = null;
  if (tab === "feedback") {
    const { data } = await sb.from("feedback_inbox").select("*").order("created_at", { ascending: false }).limit(100);
    const rows = data ?? [];
    body = (
      <section className="card">
        <h2 className="h2">Complaints & suggestions · {rows.filter((r) => r.status !== "resolved").length} open</h2>
        <p className="muted text-sm">Parents, students and staff send these from their app. Anonymous ones show no name.</p>
        {rows.length === 0 && <p className="muted">Nothing received yet.</p>}
        {rows.map((r) => (
          <form key={r.id} action={replyFeedback} className="row-box flex-col items-stretch gap-2">
            <input type="hidden" name="id" value={r.id} />
            <div className="flex flex-wrap items-center gap-2"><span className={`pill ${r.kind === "complaint" ? "pill-red" : r.kind === "praise" ? "pill-green" : "pill-purple"}`}>{r.kind}</span><span className="tagx">{r.topic}</span>
              <span className="muted text-xs">{r.from_name ? `${r.from_name} (${r.from_role})` : "Anonymous"} · {shortDate(r.created_at)}</span><span className={`pill ${STATUS[r.status]} ml-auto`}>{r.status.replace("_", " ")}</span></div>
            <p className="font-bold">{r.body}</p>
            {r.reply && <p className="text-sm"><b>Reply:</b> {r.reply}</p>}
            {r.status !== "resolved" && <div className="flex flex-wrap gap-2">
              <input className="input min-w-0 flex-1" name="reply" placeholder="Reply they will see" />
              <select className="input w-auto" name="status" defaultValue={r.status === "open" ? "in_progress" : "resolved"}><option value="in_progress">Working on it</option><option value="resolved">Resolved</option></select>
              <button className="btn" type="submit">Save</button></div>}
          </form>
        ))}
      </section>
    );
  }

  if (tab === "transport") {
    const [{ data: vans }, { data: vs }, { data: kids }, { data: trips }] = await Promise.all([
      sb.from("vans").select("*").order("name"),
      sb.from("van_students").select("van_id, student_id, stop"),
      sb.from("students").select("id, full_name, sections(name, classes(name))").eq("status", "enrolled").order("full_name").limit(3000),
      sb.from("van_trips").select("van_id, leg, missing").eq("date", today),
    ]);
    type St = { id: string; full_name: string; sections: { name: string; classes: { name: string } } | null };
    const K = (kids ?? []) as unknown as St[];
    const nameOf = new Map(K.map((k) => [k.id, `${k.full_name} (${k.sections ? `${k.sections.classes.name} ${k.sections.name}` : ""})`]));
    const van = sp.van === "new" ? undefined : (vans ?? []).find((v) => v.id === sp.van) ?? (vans ?? [])[0];
    const riders = (vs ?? []).filter((x) => x.van_id === van?.id);
    const leg = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi", hour: "numeric", hour12: false })) < 11 ? "morning" : "afternoon";
    const trip = (trips ?? []).find((t) => t.van_id === van?.id && t.leg === leg);
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="tile"><span className="muted">Vans</span><b>{(vans ?? []).length}</b></div>
          <div className="tile"><span className="muted">Students using</span><b>{(vs ?? []).length}</b></div>
          <div className="tile"><span className="muted">Van fee / month</span><b>{rupees((vs ?? []).reduce((t, x) => t + Number((vans ?? []).find((v) => v.id === x.van_id)?.monthly_fee_paisa ?? 0), 0))}</b></div>
          <div className="tile"><span className="muted">Trips marked today</span><b>{(trips ?? []).length}</b></div>
        </div>
        <div className="flex flex-wrap gap-2">{(vans ?? []).map((v) => <Link key={v.id} href={`/principal/care?tab=transport&van=${v.id}`} className={`pill ${v.id === van?.id ? "pill-blue" : "pill-gray"}`}>{v.name}</Link>)}</div>
        <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
          <form action={saveVan} className="card">
            <input type="hidden" name="id" value={van?.id ?? ""} />
            <h2 className="h2">{van ? `Edit ${van.name}` : "Add a van"}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">Name<input className="input" name="name" required defaultValue={van?.name ?? ""} placeholder="Van 1" /></label>
              <label className="field">Number plate<input className="input" name="plate" defaultValue={van?.plate ?? ""} /></label>
              <label className="field">Driver<input className="input" name="driver_name" defaultValue={van?.driver_name ?? ""} /></label>
              <label className="field">Driver phone<input className="input" name="driver_phone" defaultValue={van?.driver_phone ?? ""} /></label>
              <label className="field">Seats<input className="input" type="number" name="seats" defaultValue={van?.seats ?? ""} /></label>
              <label className="field">Fee / month (Rs)<input className="input" type="number" name="fee" defaultValue={van ? van.monthly_fee_paisa / 100 : ""} /></label>
            </div>
            <label className="field">Route<input className="input" name="route" defaultValue={van?.route ?? ""} placeholder="Model Town → Faisal Town → School" /></label>
            <div className="flex gap-2"><button className="btn" type="submit">Save</button>{van && <Link className="btn-ghost" href="/principal/care?tab=transport&van=new">New van</Link>}</div>
          </form>
          {van && <section className="card">
            <h2 className="h2">{van.name} · {riders.length}{van.seats ? `/${van.seats}` : ""} students</h2>
            <form action={assignVan} className="flex flex-wrap gap-2">
              <input type="hidden" name="van_id" value={van.id} />
              <select className="input min-w-0 flex-1" name="student_id" required><option value="">Choose student</option>{K.filter((k) => !riders.some((r) => r.student_id === k.id)).map((k) => <option key={k.id} value={k.id}>{nameOf.get(k.id)}</option>)}</select>
              <input className="input w-32" name="stop" placeholder="Stop" />
              <button className="btn" type="submit">Add</button>
            </form>
            <form action={markTrip} className="flex flex-col gap-2">
              <input type="hidden" name="van_id" value={van.id} /><input type="hidden" name="date" value={today} /><input type="hidden" name="leg" value={leg} />
              <div className="eyebrow">{leg} trip · tick who is on the van {trip ? `· marked, ${trip.missing.length} missing` : ""}</div>
              {riders.map((r) => (
                <label key={r.student_id} className="row-box">
                  <input type="hidden" name="all" value={r.student_id} />
                  <input type="checkbox" name="here" value={r.student_id} defaultChecked={!trip?.missing.includes(r.student_id)} className="h-5 w-5" />
                  <span className="flex-1 font-extrabold">{nameOf.get(r.student_id) ?? "Student"}</span><span className="muted text-xs">{r.stop}</span>
                </label>
              ))}
              {riders.length > 0 && <button className="btn-ghost self-start" type="submit">Save {leg} trip</button>}
            </form>
            {riders.length > 0 && <div className="eyebrow">Remove</div>}
            {riders.map((r) => (
              <form key={r.student_id} action={assignVan} className="flex items-center justify-between text-xs font-bold"><input type="hidden" name="student_id" value={r.student_id} /><span>{nameOf.get(r.student_id)}</span><button className="muted underline" type="submit">remove from van</button></form>
            ))}
          </section>}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Complaints &amp; vans</h1><p className="muted text-base">The complaints box, and school vans with who rides them. Lesson observations are in Staff &amp; pay, the morning brief in Messages.</p></div>
        <Tabs current={tab} tabs={[["feedback", "Complaints"], ["transport", "Vans"]].map(([id, label]) => ({ id, label, href: `/principal/care?tab=${id}` }))} />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {body}
    </>
  );
}
