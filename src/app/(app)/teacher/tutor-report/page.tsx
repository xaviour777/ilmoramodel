import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { checkableSections } from "@/lib/paper-check/data";

type Row = { student_id: string; subject_name: string; topic: string; is_stuck: boolean; practice_score: number | null; students: { full_name: string; section_id: string | null } | null };

// Which homework topics students got stuck on this week, so the teacher can explain them again in class.
export default async function TutorReportPage() {
  const me = await requireRole("teacher", "principal", "owner");
  const supabase = await createClient();
  const sections = new Set((await checkableSections(me)).map((s) => s.id));
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await supabase
    .from("tutor_sessions")
    .select("student_id, subject_name, topic, is_stuck, practice_score, students(full_name, section_id)")
    .gte("created_at", since)
    .limit(1000);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.students?.section_id && sections.has(r.students.section_id));
  const byTopic = new Map<string, { subject: string; topic: string; used: number; stuck: string[]; scores: number[] }>();
  for (const r of rows) {
    const k = `${r.subject_name}|${r.topic}`;
    const t = byTopic.get(k) ?? { subject: r.subject_name, topic: r.topic, used: 0, stuck: [], scores: [] };
    t.used++;
    if (r.is_stuck && r.students) t.stuck.push(r.students.full_name);
    if (r.practice_score != null) t.scores.push(r.practice_score);
    byTopic.set(k, t);
  }
  const topics = [...byTopic.values()].sort((a, b) => b.stuck.length - a.stuck.length);

  return (
    <>
      <div>
        <h1 className="h1">Homework tutor report</h1>
        <p className="muted text-base">Last 7 days. Topics where many students needed the full answer are worth explaining again in class.</p>
      </div>
      <section className="card">
        {topics.length === 0 && <p className="muted">No student in your classes used the tutor this week.</p>}
        {topics.map((t) => (
          <div key={`${t.subject}|${t.topic}`} className="row-box">
            <div className="min-w-0 flex-1">
              <div className="truncate font-extrabold">{t.subject} · {t.topic}</div>
              <div className="muted text-xs">
                {t.used} students used the tutor{t.scores.length > 0 && ` · practice average ${(t.scores.reduce((a, b) => a + b, 0) / t.scores.length).toFixed(1)}/5`}
                {t.stuck.length > 0 && ` · stuck: ${t.stuck.slice(0, 8).join(", ")}`}
              </div>
            </div>
            <span className={`pill ${t.stuck.length ? "pill-red" : "pill-green"}`}>{t.stuck.length} stuck</span>
          </div>
        ))}
      </section>
    </>
  );
}
