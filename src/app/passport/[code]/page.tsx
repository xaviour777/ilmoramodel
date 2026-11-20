import { createClient } from "@/lib/supabase/server";
import { KIND_ICON, KIND_LABEL } from "@/lib/learning";
import { shortDate } from "@/lib/format";

export const metadata = { title: "Model Passport", robots: { index: false, follow: false } };
type Pub = { name: string; school: string; campus: string; class: string | null; items: { kind: string; title: string; body: string | null; on: string; subject: string | null }[] };

// Public view of a Model Passport, only when a guardian turned sharing on, and only the items they ticked.
// The link uses a random code, never the student's database id.
export default async function PublicPassport({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{32}$/.test(code) ? await supabase.rpc("public_passport", { p_code: code }) : { data: null };
  const p = data as Pub | null;
  return (
    <main className="ilm mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-8">
      {!p ? (
        <div className="card text-center"><h1 className="h1" style={{ fontSize: 26 }}>This link is not active</h1><p className="muted">The family may have turned sharing off or made a new link.</p></div>
      ) : (
        <>
          <section className="rounded-3xl p-6 text-white" style={{ background: "linear-gradient(135deg,#0f2a44,#12806b)" }}>
            <div className="text-xs font-black uppercase tracking-widest opacity-80">Model Passport</div>
            <div className="mt-1 text-3xl font-black">{p.name}</div>
            <div className="font-bold opacity-90">{p.class ? `${p.class} · ` : ""}{p.school || p.campus}</div>
          </section>
          {p.items.length === 0 ? <p className="muted">Nothing has been chosen to show yet.</p> : p.items.map((i, n) => (
            <div key={n} className="card">
              <div className="eyebrow">{KIND_ICON[i.kind]} {KIND_LABEL[i.kind]?.[0]} · {shortDate(i.on)}{i.subject ? ` · ${i.subject}` : ""}</div>
              <div className="text-lg font-black">{i.title}</div>
              {i.body && <p className="font-semibold">{i.body}</p>}
              <span className="pill pill-green self-start">Approved by the school</span>
            </div>
          ))}
          <p className="muted text-center text-xs">Shared by the family with their consent.</p>
        </>
      )}
    </main>
  );
}
