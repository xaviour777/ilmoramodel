import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { createNotice, deleteNotice } from "../actions";

const AUD: Record<string, string> = { everyone: "Everyone", staff: "Staff only", parents: "Parents and students", class: "One class", section: "One section" };

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: notices }, { data: classes }, { data: sections }] = await Promise.all([
    supabase.from("notices").select("*, classes(name), sections(name, classes(name))").order("created_at", { ascending: false }),
    supabase.from("classes").select("id, name").order("sort"),
    supabase.from("sections").select("id, name, classes(name)"),
  ]);
  return (
    <>
      <div>
        <h1 className="h1">Notices</h1>
        <p className="muted text-base">One message to the whole school, staff, or a single class. It shows in everyone&apos;s app.</p>
      </div>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <form action={createNotice} className="card xl:w-[420px]">
          <h2 className="h2">New notice</h2>
          {sp.saved && <div className="notice-ok">Published.</div>}
          {sp.error && <div className="notice-bad">{sp.error}</div>}
          <label className="field">Title<input className="input" name="title" required placeholder="School closed tomorrow due to smog" /></label>
          <label className="field">Message<textarea className="input min-h-28 py-3" name="body" required /></label>
          <label className="field">Who sees it<select className="input" name="audience">{Object.entries(AUD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field">Class or section (if one is chosen above)
            <select className="input" name="target">
              <option value="">None</option>
              <optgroup label="Classes">{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
              <optgroup label="Sections">{((sections ?? []) as unknown as { id: string; name: string; classes: { name: string } }[]).map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}</option>)}</optgroup>
            </select>
          </label>
          <button className="btn" type="submit">Publish</button>
        </form>
        <section className="card flex-1">
          <h2 className="h2">Published</h2>
          {(notices ?? []).map((n) => (
            <form key={n.id} action={deleteNotice} className="flex flex-col gap-1.5 rounded-2xl border-2 p-3.5" style={{ borderColor: "var(--line)" }}>
              <input type="hidden" name="notice_id" value={n.id} />
              <div className="flex items-start justify-between gap-2">
                <div className="text-lg font-black">{n.title}</div>
                <span className="pill pill-blue">{n.audience === "class" ? n.classes?.name : n.audience === "section" ? `${n.sections?.classes?.name}-${n.sections?.name}` : AUD[n.audience]}</span>
              </div>
              <p className="text-sm font-semibold">{n.body}</p>
              <div className="flex justify-between"><span className="muted text-xs">{new Date(n.created_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}</span>
                <button className="muted text-xs underline" type="submit">Delete</button></div>
            </form>
          ))}
        </section>
      </div>
    </>
  );
}
