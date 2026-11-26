import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pct, shortDate, todayPK } from "@/lib/format";
import { Bar, Empty, Insight, Stat, Stats } from "@/components/ilm";
import { STATUS, statusOf } from "@/lib/syllabus";

// Principal: every class and subject on the road to the final, done vs. what the plan says by today.
export async function RoadTab({ cls }: { cls?: string }) {
  const supabase = await createClient();
  const today = todayPK();
  const [{ data: classes }, { data: subs }, { data: books }, { data: prog }, { data: exams }, { data: sessions }] = await Promise.all([
    supabase.from("classes").select("id, name, sort").order("sort"),
    supabase.from("section_subjects").select("subject_id, teacher_id, subjects(name), profiles(full_name), sections!inner(class_id)"),
    supabase.from("syllabus_books").select("id, class_id, subject_id, title, finish_by"),
    supabase.from("syllabus_progress").select("book_id, total, done, should, at_chapter, chapters"),
    supabase.from("exams").select("id, name, starts_on, terms!inner(session_id)").not("starts_on", "is", null).order("starts_on"),
    supabase.from("academic_sessions").select("id, starts_on, ends_on, is_current").order("starts_on", { ascending: false }),
  ]);
  // the school year that holds today (the one marked current only when none does)
  const session = (sessions ?? []).find((x) => x.starts_on <= today && x.ends_on >= today) ?? (sessions ?? []).find((x) => x.is_current);
  type S = { subject_id: string; subjects: { name: string }; profiles: { full_name: string } | null; sections: { class_id: string } };
  const pairs = [...new Map(((subs ?? []) as unknown as S[]).map((s) => [`${s.sections.class_id}|${s.subject_id}`, { cls: s.sections.class_id, subj: s.subject_id, subject: s.subjects.name, teacher: s.profiles?.full_name ?? "" }])).values()];
  const P = new Map((prog ?? []).map((r) => [r.book_id as string, r]));
  const rows = pairs.map((p) => {
    const b = (books ?? []).find((x) => x.class_id === p.cls && x.subject_id === p.subj);
    const r = b ? P.get(b.id) : undefined;
    return { ...p, book: b, total: r?.total ?? 0, done: r?.done ?? 0, should: r?.should ?? 0, at: r?.at_chapter ?? 0, chapters: r?.chapters ?? 0, status: r ? statusOf(r.done, r.should) : null };
  });
  const planned = rows.filter((r) => r.status);
  const count = (s: string) => planned.filter((r) => r.status === s).length;
  const doneAll = planned.reduce((a, r) => a + r.done, 0), totalAll = planned.reduce((a, r) => a + r.total, 0);
  const worst = [...planned].sort((a, b) => (b.should - b.done) - (a.should - a.done))[0];
  const className = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const shown = (classes ?? []).filter((c) => !cls || c.id === cls).filter((c) => rows.some((r) => r.cls === c.id));

  // the year's road: start, each exam, end; today's place on it
  const s0 = session?.starts_on ?? today, s1 = session?.ends_on ?? today;
  const span = Math.max(1, Date.parse(s1) - Date.parse(s0));
  const at = (d: string) => Math.max(0, Math.min(100, ((Date.parse(d) - Date.parse(s0)) / span) * 100));
  const ex = ((exams ?? []) as unknown as { id: string; name: string; starts_on: string; terms: { session_id: string } }[]).filter((e) => e.terms.session_id === session?.id);
  return (
    <>
      <Stats>
        <Stat label="Books planned" value={`${planned.length} / ${rows.length}`} sub="class × subject" href="/teacher/plans/syllabus" />
        <Stat label="On track" value={count("ok")} tone="#15803d" />
        <Stat label="Behind" value={count("behind")} tone="#b45309" warn={count("behind") > 0} />
        <Stat label="Far behind" value={count("far")} tone="#b91c1c" warn={count("far") > 0} />
        <Stat label="Whole school" value={pct(doneAll / (totalAll || 1))} sub="of planned lessons done" />
      </Stats>
      {worst && worst.should - worst.done >= 2 && <Insight>{className.get(worst.cls)} {worst.subject} is furthest behind: {worst.should - worst.done} lessons{worst.teacher ? ` (${worst.teacher})` : ""}. The teacher can tap Re-plan from today, or you can add an extra period in the timetable.</Insight>}

      <section className="card">
        <h2 className="h2">The year</h2>
        <div className="relative mt-6 mb-10 h-3 rounded-full bg-[#eef2f7]">
          <div className="h-full rounded-full bg-[#0284c7]" style={{ width: `${at(today)}%` }} />
          {ex.map((e) => (
            <div key={e.id} className="absolute -top-6 -translate-x-1/2 text-center text-[11px] font-black whitespace-nowrap" style={{ left: `${at(e.starts_on)}%` }}>
              {e.name}<div className="mx-auto mt-0.5 h-8 w-0.5 bg-[#7c3aed]" /><span className="muted">{shortDate(e.starts_on)}</span>
            </div>
          ))}
        </div>
        <div className="muted flex justify-between text-sm font-bold"><span>{shortDate(s0)}</span><span>Today {shortDate(today)}</span><span>{shortDate(s1)}</span></div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/principal/exams?tab=road" className={!cls ? "btn min-h-10 px-3 text-sm" : "btn-ghost min-h-10 px-3 text-sm"}>All classes</Link>
        {(classes ?? []).filter((c) => rows.some((r) => r.cls === c.id)).map((c) => <Link key={c.id} href={`/principal/exams?tab=road&cls=${c.id}`} className={cls === c.id ? "btn min-h-10 px-3 text-sm" : "btn-ghost min-h-10 px-3 text-sm"}>{c.name}</Link>)}
      </div>
      {rows.length === 0 && <Empty>Assign subjects to classes first (Classes → Subjects). Then each teacher gives their book in Lesson plans → Whole-year syllabus.</Empty>}
      <div className="grid gap-4 xl:grid-cols-2">
        {shown.map((c) => (
          <section key={c.id} className="card">
            <h2 className="h2">{c.name}</h2>
            {rows.filter((r) => r.cls === c.id).sort((a, b) => a.subject.localeCompare(b.subject)).map((r) => (
              <Link key={r.subj} href={`/teacher/plans/syllabus?cls=${r.cls}&subj=${r.subj}`} className="block border-t-2 border-[#f1f5f9] py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-extrabold">
                  <span>{r.subject}{r.status ? <span className="muted"> · Ch {r.at || 1} of {r.chapters}</span> : null}{r.teacher ? <span className="muted"> · {r.teacher}</span> : null}</span>
                  {r.status ? <span className={`tagx ${STATUS[r.status][1]}`}>{r.should - r.done >= 2 ? `${r.should - r.done} behind` : STATUS[r.status][0]}</span> : <span className="tagx">no plan yet</span>}
                </div>
                {r.status && <div className="relative mt-1">
                  <Bar value={r.done / (r.total || 1)} color={r.status === "ok" ? "#16a34a" : r.status === "behind" ? "#f59e0b" : "#dc2626"} />
                  <div className="absolute top-[-3px] h-[18px] w-0.5 bg-[#0f172a]" style={{ left: `${(r.should / (r.total || 1)) * 100}%` }} title="Where the plan says they should be today" />
                </div>}
              </Link>
            ))}
          </section>
        ))}
      </div>
      <p className="muted text-sm">The thin black line is where the plan says the class should be today. Parents and students see the same road on their Exams page.</p>
    </>
  );
}
