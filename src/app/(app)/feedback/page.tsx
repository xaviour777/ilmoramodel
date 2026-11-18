import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/format";
import { sendFeedback } from "./actions";

const STATUS: Record<string, [string, string]> = { open: ["Received", "pill-orange"], in_progress: ["Working on it", "pill-blue"], resolved: ["Resolved", "pill-green"] };

// Complaints & suggestions straight to the principal.
export default async function Feedback({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("parent", "student", "teacher", "accountant");
  const sp = await searchParams;
  const sb = await createClient();
  const { data } = await sb.from("feedback").select("id, kind, topic, body, status, reply, created_at, anonymous").order("created_at", { ascending: false });
  return (
    <>
      <div><h1 className="h1">Complaints & suggestions</h1><p className="muted text-base">Goes straight to the principal. You can keep your name hidden.</p></div>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <form action={sendFeedback} className="card xl:w-[400px]">
          {sp.saved && <div className="notice-ok">Sent. You will see the reply here.</div>}
          {sp.error && <div className="notice-bad">{sp.error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Type<select className="input" name="kind"><option value="complaint">Complaint</option><option value="suggestion">Suggestion</option><option value="praise">Praise</option></select></label>
            <label className="field">About<select className="input" name="topic">{["teaching", "fees", "transport", "safety", "facilities", "other"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          </div>
          <label className="field">Message<textarea className="input min-h-28 py-2" name="body" required minLength={3} maxLength={2000} /></label>
          <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="anonymous" className="h-5 w-5" /> Hide my name</label>
          <button className="btn" type="submit">Send</button>
        </form>
        <section className="card flex-1">
          <h2 className="h2">Sent by me</h2>
          {(data ?? []).length === 0 && <p className="muted">Nothing yet.</p>}
          {(data ?? []).map((r) => (
            <div key={r.id} className="row-box flex-col items-stretch">
              <div className="flex items-center gap-2"><span className="tagx">{r.kind} · {r.topic}</span><span className="muted text-xs">{shortDate(r.created_at)}{r.anonymous ? " · name hidden" : ""}</span><span className={`pill ${STATUS[r.status][1]} ml-auto`}>{STATUS[r.status][0]}</span></div>
              <p className="font-bold">{r.body}</p>
              {r.reply && <p className="text-sm"><b>School:</b> {r.reply}</p>}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
