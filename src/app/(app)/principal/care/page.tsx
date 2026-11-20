import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate, todayPK } from "@/lib/format";
import { mobilePK, whatsappLink } from "@/lib/messages";
import { buildBrief } from "@/lib/brief";
import { Tabs } from "@/components/tabs";
import { addObservation, replyFeedback, saveBrief } from "./actions";
import { TransportTab } from "./transport";

type Search = { tab?: string; van?: string; saved?: string; error?: string; t?: string; route?: string; login?: string };
const STATUS: Record<string, string> = { open: "pill-orange", in_progress: "pill-blue", resolved: "pill-green" };
const SCORES = [["planning", "Planning"], ["delivery", "Teaching"], ["engagement", "Class involvement"], ["discipline", "Discipline"]] as const;

// Complaints box, teacher observations, transport and the morning brief.
export default async function Care({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("principal", "owner");
  const sp = await searchParams;
  const sb = await createClient();
  const tab = ["feedback", "observe", "transport", "brief"].includes(sp.tab ?? "") ? sp.tab! : "feedback";
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

  if (tab === "observe") {
    const [{ data: teachers }, { data: secs }, { data: obs }] = await Promise.all([
      sb.from("profiles").select("id, full_name").eq("role", "teacher").eq("is_active", true).order("full_name"),
      sb.from("sections").select("id, name, classes(name, sort)"),
      sb.from("observations").select("*").order("observed_on", { ascending: false }).limit(60),
    ]);
    const tname = new Map((teachers ?? []).map((t) => [t.id, t.full_name]));
    const sname = new Map(((secs ?? []) as unknown as { id: string; name: string; classes: { name: string } }[]).map((s) => [s.id, `${s.classes.name} ${s.name}`]));
    const score = (o: Record<string, number | null>) => { const v = SCORES.map(([k]) => o[k]).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    body = (
      <div className="grid gap-5 xl:grid-cols-[400px_1fr] xl:items-start">
        <form action={addObservation} className="card">
          <h2 className="h2">Observe a lesson</h2>
          <label className="field">Teacher<select className="input" name="teacher_id" required>{(teachers ?? []).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Class<select className="input" name="section_id"><option value="">—</option>{[...sname].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
            <label className="field">Date<input className="input" type="date" name="observed_on" defaultValue={today} /></label>
          </div>
          {SCORES.map(([k, l]) => <label key={k} className="field">{l} (1–5)<input className="input" type="number" min={1} max={5} name={k} defaultValue={3} /></label>)}
          <label className="field">Went well<input className="input" name="strengths" /></label>
          <label className="field">To improve<input className="input" name="improve" /></label>
          <button className="btn" type="submit">Save · teacher will see it</button>
        </form>
        <section className="card">
          <h2 className="h2">Observations</h2>
          {(obs ?? []).length === 0 && <p className="muted">None yet.</p>}
          {(obs ?? []).map((o) => { const s = score(o); return (
            <div key={o.id} className="row-box flex-wrap">
              <div className="min-w-40 flex-1"><div className="font-extrabold">{tname.get(o.teacher_id) ?? "Teacher"}</div><div className="muted text-xs">{shortDate(o.observed_on)}{o.section_id ? ` · ${sname.get(o.section_id) ?? ""}` : ""}{o.improve ? ` · improve: ${o.improve}` : ""}</div></div>
              <span className="text-lg font-black">{s == null ? "—" : `${s.toFixed(1)}/5`}</span>
            </div>); })}
        </section>
      </div>
    );
  }

  if (tab === "transport") body = <TransportTab sp={sp} />;

  if (tab === "brief") {
    const [{ data: s }, { data: camp }] = await Promise.all([
      sb.from("campus_settings").select("brief_phone, brief_enabled").eq("campus_id", me.campus_id).maybeSingle(),
      sb.from("campuses").select("schools(name)").eq("id", me.campus_id).maybeSingle(),
    ]);
    const text = await buildBrief(sb, me.campus_id, (camp?.schools as unknown as { name: string } | null)?.name ?? me.campus_name);
    const phone = mobilePK(s?.brief_phone);
    body = (
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <h2 className="h2">Today&apos;s brief</h2>
          <pre className="whitespace-pre-wrap rounded-xl p-3 text-sm font-bold" style={{ background: "var(--blue-soft)" }}>{text}</pre>
          {phone && <a className="btn self-start" target="_blank" rel="noreferrer" href={whatsappLink(phone, text)}>Open in WhatsApp</a>}
        </section>
        <form action={saveBrief} className="card">
          <h2 className="h2">Send every morning</h2>
          <p className="muted text-sm">At 7 am (Mon–Sat) this goes to your phone on the school&apos;s WhatsApp or SMS from Settings.</p>
          <label className="field">My mobile<input className="input" name="brief_phone" defaultValue={s?.brief_phone ?? ""} placeholder="0300 1234567" /></label>
          <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="brief_enabled" defaultChecked={s?.brief_enabled ?? false} className="h-5 w-5" /> Send me the brief daily</label>
          <button className="btn self-start" type="submit">Save</button>
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">School care</h1><p className="muted text-base">Complaints box, lesson observations, vans and your morning brief.</p></div>
        <Tabs current={tab} tabs={[["feedback", "Complaints"], ["observe", "Observations"], ["transport", "Transport"], ["brief", "Morning brief"]].map(([id, label]) => ({ id, label, href: `/principal/care?tab=${id}` }))} />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {body}
    </>
  );
}
