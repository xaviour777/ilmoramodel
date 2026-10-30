import { createClient } from "@/lib/supabase/server";
import { shortDate, todayPK } from "@/lib/format";

export async function NoticesList() {
  const supabase = await createClient();
  const [{ data }, { data: holidays }] = await Promise.all([
    supabase.from("notices").select("id, title, body, created_at").order("created_at", { ascending: false }).limit(4),
    supabase.from("holidays").select("id, title, starts_on, ends_on").neq("kind", "event").gte("ends_on", todayPK()).order("starts_on").limit(4),
  ]);
  return (
    <section className="card">
      <h2 className="h2">Notices</h2>
      {(data ?? []).length === 0 && <p className="muted">No notices.</p>}
      {(data ?? []).map((n) => (
        <div key={n.id}><div className="font-black">{n.title}</div><p className="text-sm font-semibold">{n.body}</p></div>
      ))}
      {(holidays ?? []).length > 0 && (
        <>
          <h3 className="mt-1 font-black">Coming holidays</h3>
          {(holidays ?? []).map((h) => (
            <div key={h.id} className="flex flex-wrap justify-between gap-2 text-sm font-bold">
              <span>{h.title}</span>
              <span className="muted">{h.starts_on === h.ends_on ? shortDate(h.starts_on) : `${shortDate(h.starts_on)} to ${shortDate(h.ends_on)}`}</span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
