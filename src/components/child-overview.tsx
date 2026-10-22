import { createClient } from "@/lib/supabase/server";
import { pct, shortDate, todayPK } from "@/lib/format";

type Child = { id: string; full_name: string; section_id: string | null; sections: { name: string; classes: { name: string } } | null };

// Everything a parent or student needs about one child. Row-level security makes sure
// a family only ever gets its own rows back.
export async function ChildOverview({ child }: { child: Child }) {
  const supabase = await createClient();
  const today = todayPK();
  const since = new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10);
  const [{ data: att }, { data: homework }, { data: marks }, { data: notes }, { data: diary }] = await Promise.all([
    supabase.from("attendance").select("date, status").eq("student_id", child.id).gte("date", since).order("date", { ascending: false }),
    child.section_id
      ? supabase.from("homework").select("id, title, due_on, subjects(name)").eq("section_id", child.section_id).gte("due_on", today).order("due_on").limit(6)
      : Promise.resolve({ data: [] }),
    supabase.from("marks").select("obtained, is_absent, subjects(name), exams(name, total_marks)").eq("student_id", child.id).limit(30),
    supabase.from("behaviour_notes").select("id, kind, note, created_at").eq("student_id", child.id).order("created_at", { ascending: false }).limit(3),
    child.section_id
      ? supabase.from("lesson_diary").select("id, topic, date, subjects(name)").eq("section_id", child.section_id).order("date", { ascending: false }).limit(4)
      : Promise.resolve({ data: [] }),
  ]);
  const todayMark = (att ?? []).find((a) => a.date === today);
  const present = (att ?? []).filter((a) => a.status === "present" || a.status === "late").length;
  const rate = (att ?? []).length ? present / (att ?? []).length : 0;
  type Mark = { obtained: number | null; is_absent: boolean; subjects: { name: string }; exams: { name: string; total_marks: number } };
  const byExam = new Map<string, Mark[]>();
  for (const m of (marks ?? []) as unknown as Mark[]) byExam.set(m.exams.name, [...(byExam.get(m.exams.name) ?? []), m]);
  const statusText: Record<string, [string, string, string]> = {
    present: ["is in school", "var(--green-soft)", "var(--green-ink)"],
    late: ["came late today", "var(--orange-soft)", "var(--orange-ink)"],
    absent: ["is absent today", "var(--red-soft)", "var(--red-ink)"],
    leave: ["is on leave today", "var(--purple-soft)", "var(--purple-ink)"],
  };
  const s = todayMark ? statusText[todayMark.status] : null;
  const first = child.full_name.split(" ")[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl p-4 font-black" style={{ background: s?.[1] ?? "#f2f2f2", color: s?.[2] ?? "#4b4b4b" }}>
        <div className="text-lg">{first} {s ? s[0] : "hasn't been marked yet today"}</div>
        <div className="text-sm font-bold">{child.sections ? `${child.sections.classes.name}-${child.sections.name}` : ""} · {pct(rate)} attendance in the last 30 days</div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card">
          <h2 className="h2">Homework due</h2>
          {(homework ?? []).length === 0 && <p className="muted">Nothing due. </p>}
          {((homework ?? []) as unknown as { id: string; title: string; due_on: string; subjects: { name: string } | null }[]).map((h) => (
            <div key={h.id} className="row-box">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: h.due_on === today ? "var(--orange)" : "var(--blue)" }} />
              <div className="flex-1"><div className="font-extrabold">{h.title}</div><div className="muted text-xs">{h.subjects?.name} · due {shortDate(h.due_on)}</div></div>
            </div>
          ))}
        </section>
        <section className="card">
          <h2 className="h2">Results</h2>
          {byExam.size === 0 && <p className="muted">Results show here once the school publishes them.</p>}
          {[...byExam.entries()].map(([exam, ms]) => {
            const got = ms.reduce((t, m) => t + Number(m.obtained ?? 0), 0);
            const out = ms.reduce((t, m) => t + m.exams.total_marks, 0);
            return (
              <div key={exam} className="flex flex-col gap-2">
                <div className="flex justify-between"><b>{exam}</b><b className="tabular-nums">{got}/{out} · {pct(out ? got / out : 0)}</b></div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {ms.map((m) => (
                    <div key={m.subjects.name} className="rounded-xl p-2 text-sm font-bold" style={{ background: "var(--page)" }}>
                      {m.subjects.name}<div className="font-black tabular-nums">{m.is_absent ? "Absent" : `${m.obtained}/${m.exams.total_marks}`}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
        <section className="card">
          <h2 className="h2">From the teachers</h2>
          {(notes ?? []).map((n) => (
            <div key={n.id} className="row-box"><span className={`pill ${n.kind === "praise" ? "pill-green" : "pill-red"}`}>{n.kind}</span><span className="flex-1 text-sm font-bold">{n.note}</span></div>
          ))}
          {((diary ?? []) as unknown as { id: string; topic: string; date: string; subjects: { name: string } | null }[]).map((d) => (
            <div key={d.id} className="text-sm font-bold"><span className="eyebrow">{shortDate(d.date)} · {d.subjects?.name}</span><br />{d.topic}</div>
          ))}
          {(notes ?? []).length === 0 && (diary ?? []).length === 0 && <p className="muted">Nothing new.</p>}
        </section>
        <section className="card">
          <h2 className="h2">Last 30 days</h2>
          <div className="flex flex-wrap gap-1.5">
            {[...(att ?? [])].reverse().map((a) => (
              <span key={a.date} title={`${shortDate(a.date)}: ${a.status}`} className="grid h-8 w-8 place-items-center rounded-lg text-[11px] font-black"
                style={{ background: statusText[a.status][1], color: statusText[a.status][2] }}>{a.date.slice(8)}</span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
