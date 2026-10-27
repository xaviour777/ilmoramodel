import Link from "next/link";
import { requireRole } from "@/lib/me";
import { myKids, sessionsFor } from "@/lib/tutor/data";
import { shortDate } from "@/lib/format";

// A parent's weekly view of the homework tutor for one child, with every chat they can read.
export default async function ParentTutorPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const me = await requireRole("parent");
  const sp = await searchParams;
  const kids = await myKids(me);
  const kid = kids.find((k) => k.id === sp.child) ?? kids[0];
  if (!kid) return <p className="muted">No children are linked to your account yet.</p>;
  const sessions = await sessionsFor(kid.id, 7);
  const minutes = Math.round(sessions.reduce((m, s) => m + Math.min(30, s.messages.filter((x) => x.role === "student").length * 1.5), 0));
  const stuck = [...new Set(sessions.filter((s) => s.is_stuck).map((s) => `${s.subject_name}: ${s.topic}`))];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">{kid.full_name}: homework tutor</h1>
          <p className="muted text-base">Is hafte bache ne tutor ke saath kya parha, aur kahan atka.</p>
        </div>
        <Link href={`/student/tutor?child=${kid.id}`} className="btn">Bache ke saath tutor kholo</Link>
      </div>
      {kids.length > 1 && (
        <div className="flex flex-wrap gap-2">{kids.map((k) => (
          <Link key={k.id} href={`/parent/tutor?child=${k.id}`} className="chip" aria-current={k.id === kid.id ? "page" : undefined}>{k.full_name}</Link>
        ))}</div>
      )}
      <section className="card">
        <div className="grid grid-cols-3 gap-3">
          <div className="tile"><div className="muted text-xs font-extrabold uppercase">Sessions</div><div className="text-2xl font-black">{sessions.length}</div></div>
          <div className="tile"><div className="muted text-xs font-extrabold uppercase">About</div><div className="text-2xl font-black">{minutes} min</div></div>
          <div className="tile"><div className="muted text-xs font-extrabold uppercase">Practice done</div><div className="text-2xl font-black">{sessions.filter((s) => s.practice_score != null).length}</div></div>
        </div>
        {stuck.length > 0 && <div className="notice-warn">In topics par mushkil hui: {stuck.join(", ")}</div>}
      </section>
      <section className="card">
        <h2 className="h2">Saari chat</h2>
        {sessions.length === 0 && <p className="muted">Is hafte tutor use nahi hua.</p>}
        {sessions.map((s) => (
          <details key={s.id} className="rounded-2xl border-2 p-3" style={{ borderColor: "var(--line)" }}>
            <summary className="cursor-pointer font-extrabold">{s.subject_name} · {s.topic} <span className="muted text-xs">{shortDate(s.created_at.slice(0, 10))}{s.practice_score != null && ` · practice ${s.practice_score}/5`}</span></summary>
            <div className="mt-2 flex flex-col gap-1.5">
              {s.messages.map((m, i) => (
                <div key={i} className="whitespace-pre-wrap text-sm"><b>{m.role === "student" ? "Bacha" : "Tutor"}:</b> {m.text}</div>
              ))}
            </div>
          </details>
        ))}
      </section>
    </>
  );
}
