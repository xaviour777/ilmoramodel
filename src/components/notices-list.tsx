import { createClient } from "@/lib/supabase/server";

export async function NoticesList() {
  const supabase = await createClient();
  const { data } = await supabase.from("notices").select("id, title, body, created_at").order("created_at", { ascending: false }).limit(4);
  return (
    <section className="card">
      <h2 className="h2">Notices</h2>
      {(data ?? []).length === 0 && <p className="muted">No notices.</p>}
      {(data ?? []).map((n) => (
        <div key={n.id}><div className="font-black">{n.title}</div><p className="text-sm font-semibold">{n.body}</p></div>
      ))}
    </section>
  );
}
