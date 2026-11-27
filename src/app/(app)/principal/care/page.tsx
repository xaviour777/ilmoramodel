import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/format";
import { Tabs } from "@/components/tabs";
import { replyFeedback } from "./actions";
import { TransportTab } from "./transport";

type Search = { tab?: string; van?: string; saved?: string; error?: string; t?: string; route?: string; login?: string };
const STATUS: Record<string, string> = { open: "pill-orange", in_progress: "pill-blue", resolved: "pill-green" };

// Complaints box and transport.
export default async function Care({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const sb = await createClient();
  const tab = ["feedback", "transport"].includes(sp.tab ?? "") ? sp.tab! : "feedback";

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

  if (tab === "transport") body = <TransportTab sp={sp} />;


  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Complaints &amp; transport</h1><p className="muted text-base">The complaints box, and transport: routes, vehicles, drivers, riders and live trips. Lesson observations are in Staff &amp; pay, the morning brief in Messages.</p></div>
        <Tabs current={tab} tabs={[["feedback", "Complaints"], ["transport", "Transport"]].map(([id, label]) => ({ id, label, href: `/principal/care?tab=${id}` }))} />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {body}
    </>
  );
}
