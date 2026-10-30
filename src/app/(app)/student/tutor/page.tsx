import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { getLearningAi } from "@/lib/ai";
import { shortDate, todayPK } from "@/lib/format";
import { DAILY_MESSAGE_LIMIT, messagesToday } from "@/lib/tutor/tutor";
import { loadSession, myKids, sessionsFor, tutorToday } from "@/lib/tutor/data";
import { sendTutorMessage, startTutor, submitPractice } from "./actions";

type Search = { child?: string; session?: string; error?: string };

export default async function TutorPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("student", "parent");
  const sp = await searchParams;
  const supabase = await createClient();
  const kids = await myKids(me);
  const kid = kids.find((k) => k.id === sp.child) ?? kids[0];
  if (!kid) return <p className="muted">Your account isn&apos;t linked to a student record yet.</p>;

  const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [{ data: homework }, sessions, open] = await Promise.all([
    kid.section_id
      ? supabase.from("homework").select("id, title, instructions, due_on, subjects(name)").eq("section_id", kid.section_id).gte("due_on", since).order("due_on", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    sessionsFor(kid.id, 7),
    sp.session ? loadSession(sp.session) : Promise.resolve(null),
  ]);
  const session = open && open.student_id === kid.id ? open : null;
  const used = messagesToday(sessions, tutorToday());
  const demo = (await getLearningAi(supabase)).name === "demo";
  const tasks = (homework ?? []) as unknown as { id: string; title: string; instructions: string | null; due_on: string; subjects: { name: string } | null }[];

  return (
    <>
      <div>
        <h1 className="h1">Homework tutor</h1>
        <p className="muted text-base">Jo sawal samajh na aaye, &quot;Samjhao&quot; dabao. Tutor jawab seedha nahi deta: pehle ishara, phir qadam, aur do koshishon ke baad poora tareeqa.</p>
      </div>
      {kids.length > 1 && (
        <div className="flex flex-wrap gap-2">{kids.map((k) => (
          <Link key={k.id} href={`/student/tutor?child=${k.id}`} className="chip" aria-current={k.id === kid.id ? "page" : undefined}>{k.full_name}</Link>
        ))}</div>
      )}
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {demo && <div className="notice-warn">Demo tutor: it gives general hints until the real AI key is added.</div>}

      {session ? (
        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="h2">{session.subject_name} · {session.topic}</h2>
            <Link href={`/student/tutor?child=${kid.id}`} className="muted text-sm underline">All homework</Link>
          </div>
          <div className="flex flex-col gap-2">
            {session.messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 ${m.role === "student" ? "self-end" : "self-start"}`}
                style={m.role === "student" ? { background: "var(--blue-soft)", color: "var(--blue-ink)" } : { background: "var(--green-soft)", color: "var(--green-ink)" }}>
                {m.text}
              </div>
            ))}
          </div>
          {session.stage === "PRACTICE" && session.practice ? (
            <form action={submitPractice} className="flex flex-col gap-3">
              <input type="hidden" name="session_id" value={session.id} />
              {session.practice.map((p, i) => (
                <fieldset key={p.id} className="rounded-2xl border-2 p-3" style={{ borderColor: "var(--line)" }}>
                  <legend className="px-1 font-extrabold">{i + 1}. {p.question}</legend>
                  <div className="flex flex-wrap gap-3">
                    {p.options.map((o) => (
                      <label key={o} className="flex items-center gap-2"><input type="radio" name={`p_${p.id}`} value={o} required className="h-5 w-5" /> {o}</label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <button className="btn self-end" type="submit">Check my answers</button>
            </form>
          ) : session.stage === "DONE" ? (
            <p className="muted">Ye homework mukammal. {session.practice_score != null && `Practice: ${session.practice_score}/5.`}</p>
          ) : (
            <form action={sendTutorMessage} className="flex gap-2">
              <input type="hidden" name="session_id" value={session.id} />
              <input className="input flex-1" name="text" required maxLength={800} autoComplete="off"
                placeholder={session.stage === "ANSWER" ? 'Apni copy mein likho, phir "practice" likho' : "Apni koshish yahan likho…"} />
              <button className="btn" type="submit" disabled={used >= DAILY_MESSAGE_LIMIT}>Bhejo</button>
            </form>
          )}
          <p className="muted text-xs">Aaj: {used}/{DAILY_MESSAGE_LIMIT} messages. Ammi abbu ye chat dekh sakte hain.</p>
        </section>
      ) : (
        <section className="card">
          <h2 className="h2">{kid.full_name} ka homework</h2>
          {tasks.length === 0 && <p className="muted">Is hafte koi homework nahi mila.</p>}
          {tasks.map((h) => {
            const s = sessions.find((x) => x.homework_id === h.id);
            return (
              <div key={h.id} className="row-box">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold">{h.title}</div>
                  <div className="muted text-xs">{h.subjects?.name ?? "General"} · due {shortDate(h.due_on)}{h.due_on < todayPK() ? " (past)" : ""}</div>
                </div>
                {s ? (
                  <Link className="btn btn-ghost" href={`/student/tutor?child=${kid.id}&session=${s.id}`}>{s.stage === "DONE" ? "Dekho" : "Jari rakho"}</Link>
                ) : (
                  <form action={startTutor} className="flex items-center gap-2">
                    <input type="hidden" name="student_id" value={kid.id} />
                    <input type="hidden" name="homework_id" value={h.id} />
                    <select className="input w-auto" name="language" defaultValue="ROMAN_URDU" aria-label="Language">
                      <option value="ROMAN_URDU">Urdu</option><option value="ENGLISH">English</option>
                    </select>
                    <button className="btn" type="submit">Samjhao</button>
                  </form>
                )}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
