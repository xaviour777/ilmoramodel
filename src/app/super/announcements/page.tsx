import { createClient } from "@/lib/supabase/server";
import { type Plan, type SchoolRow } from "@/lib/super";
import { todayPK, shortDate } from "@/lib/format";
import { PageHead, Stats, Stat, Row, Empty } from "@/components/ilm";
import { endAnnouncement, saveAnnouncement } from "../actions";

type An = { id: string; title: string; body: string | null; tone: "info" | "warn"; audience: "all" | "plan" | "city" | "school"; audience_value: string | null; starts_on: string; ends_on: string | null; created_at: string };

export default async function Announcements({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [an, sc, pl] = await Promise.all([supabase.rpc("super_announcements"), supabase.rpc("super_schools"), supabase.rpc("super_plans")]);
  const list = (an.data ?? []) as An[];
  const schools = (sc.data ?? []) as SchoolRow[];
  const plans = (pl.data ?? []) as Plan[];
  const today = todayPK();
  const state = (a: An) => a.starts_on > today ? ["y", `Starts ${shortDate(a.starts_on)}`] : a.ends_on && a.ends_on < today ? ["", "Ended"] : ["g", "Showing now"];
  const who = (a: An) => a.audience === "all" ? "all schools" : a.audience === "plan" ? `${a.audience_value} plan` : a.audience === "city" ? `schools in ${a.audience_value}` : schools.find((s) => s.id === a.audience_value)?.name ?? "one school";
  const live = list.filter((a) => state(a)[1] === "Showing now");
  const cities = [...new Set(schools.map((s) => s.city).filter(Boolean))] as string[];
  const monthStart = today.slice(0, 8) + "01";

  return (
    <>
      <PageHead kick="Care" title="Announcements" sub="Tell every school, one plan, one city or one school about updates and downtime. Staff see it as a banner at the top of the app." />
      {(sp.error || an.error) && <div className="notice-bad">{sp.error ?? an.error?.message}</div>}
      {sp.saved && <div className="notice-ok">{sp.saved === "ended" ? "Announcement ended." : "Announcement saved."}</div>}
      <Stats>
        <Stat label="Showing now" value={live.length} tone={live.length ? "#15803d" : undefined} sub="banners staff see today" />
        <Stat label="Scheduled" value={list.filter((a) => a.starts_on > today).length} sub="start later" />
        <Stat label="This month" value={list.filter((a) => a.created_at.slice(0, 10) >= monthStart).length} sub="announcements made" />
      </Stats>

      <div className="flex flex-wrap items-start gap-5">
        <form action={saveAnnouncement} className="card flex min-w-0 flex-[2_1_360px] flex-col gap-3">
          <h2 className="h2">New announcement</h2>
          <label className="field">Title<input className="input" name="title" required maxLength={120} placeholder="Maintenance on Sunday 2–3 am" /></label>
          <label className="field">Message<textarea className="input min-h-20 py-2" name="body" maxLength={600} placeholder="The app will be read-only for one hour." /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">Show to<select className="input" name="audience" defaultValue="all">
              <option value="all">All schools</option><option value="plan">One plan</option><option value="city">One city</option><option value="school">One school</option>
            </select></label>
            <label className="field">Which plan, city or school<select className="input" name="audience_value" defaultValue="">
              <option value="">— (for all schools)</option>
              <optgroup label="Plan">{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
              <optgroup label="City">{cities.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
              <optgroup label="School">{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
            </select></label>
            <label className="field">Starts<input className="input" name="starts_on" type="date" defaultValue={today} /></label>
            <label className="field">Ends (empty = until you end it)<input className="input" name="ends_on" type="date" /></label>
            <label className="field">Style<select className="input" name="tone" defaultValue="info"><option value="info">Update (blue)</option><option value="warn">Warning (orange)</option></select></label>
          </div>
          <button className="btn self-start" type="submit">Publish</button>
        </form>

        <section className="card min-w-0 flex-[3_1_480px]">
          <h2 className="h2">All announcements</h2>
          {list.length === 0 && <div className="mt-2"><Empty>Nothing announced yet.</Empty></div>}
          {list.map((a) => { const [tc, tl] = state(a); return (
            <Row key={a.id}>
              <span className={`ilm-tile ${a.tone === "warn" ? "t-o" : "t-b"} text-[13px] font-black`}>{a.tone === "warn" ? "!" : "i"}</span>
              <div className="min-w-0 flex-[1_1_220px]"><div className="font-black">{a.title}</div>
                <div className="muted text-[12px]">{who(a)} · {shortDate(a.starts_on)}{a.ends_on && a.ends_on >= a.starts_on ? ` to ${shortDate(a.ends_on)}` : ""}{a.body ? ` · ${a.body}` : ""}</div></div>
              <span className={`tagx ${tc}`}>{tl}</span>
              {tl !== "Ended" && <form action={endAnnouncement}><input type="hidden" name="id" value={a.id} />
                <button className="btn-ghost" style={{ minHeight: 34, padding: "0 10px", fontSize: 12 }} type="submit">End</button></form>}
            </Row>); })}
        </section>
      </div>
    </>
  );
}
