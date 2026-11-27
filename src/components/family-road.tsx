import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pct, shortDate, todayPK } from "@/lib/format";
import { Bar } from "@/components/ilm";
import { statusOf } from "@/lib/syllabus";

type Kid = { id: string; full_name: string; sections: { class_id: string; classes: { name: string } } | null };
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// Students and parents: the class's road to the final. Today's lessons, each subject's progress, tests coming.
export async function FamilyRoad({ kids, tutor }: { kids: Kid[]; tutor: string }) {
  const classIds = [...new Set(kids.map((k) => k.sections?.class_id).filter(Boolean))] as string[];
  if (!classIds.length) return null;
  const supabase = await createClient();
  const today = todayPK();
  const [{ data: books }, { data: prog }, { data: soon }] = await Promise.all([
    supabase.from("syllabus_books").select("id, class_id, subject_id, finish_by, subjects(name)").in("class_id", classIds),
    supabase.from("syllabus_progress").select("book_id, total, done, should, at_chapter, chapters").in("class_id", classIds),
    supabase.from("syllabus_lessons").select("class_id, subject_id, topic, pages, homework, is_test, planned_on, done_on, subjects(name)").in("class_id", classIds).gte("planned_on", today).lte("planned_on", addDays(today, 21)).order("planned_on").order("sort").limit(600),
  ]);
  if (!(books ?? []).length) return null;
  type B = { id: string; class_id: string; subject_id: string; finish_by: string; subjects: { name: string } };
  type L = { class_id: string; subject_id: string; topic: string; pages: string | null; homework: string | null; is_test: boolean; planned_on: string; done_on: string | null; subjects: { name: string } };
  const P = new Map((prog ?? []).map((r) => [r.book_id as string, r]));
  const lessons = (soon ?? []) as unknown as L[];
  return (
    <div className="flex flex-col gap-4">
      {kids.filter((k) => k.sections).map((k) => {
        const c = k.sections!.class_id;
        const mine = ((books ?? []) as unknown as B[]).filter((b) => b.class_id === c).sort((a, b) => a.subjects.name.localeCompare(b.subjects.name));
        if (!mine.length) return null;
        const sum = mine.reduce((a, b) => { const r = P.get(b.id); return { done: a.done + (r?.done ?? 0), total: a.total + (r?.total ?? 0), should: a.should + (r?.should ?? 0) }; }, { done: 0, total: 0, should: 0 });
        const r = sum.done / (sum.total || 1);
        const behind = mine.filter((b) => { const x = P.get(b.id); return x && statusOf(x.done, x.should) !== "ok"; }).length;
        const nextDay = lessons.find((l) => l.class_id === c && !l.is_test)?.planned_on;
        const todays = lessons.filter((l) => l.class_id === c && l.planned_on === nextDay && !l.is_test);
        const tests = lessons.filter((l) => l.class_id === c && l.is_test && !l.done_on).slice(0, 4);
        return (
          <section key={k.id} className="card flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid h-20 w-20 flex-none place-items-center rounded-full" style={{ background: `conic-gradient(#0284c7 0 ${r * 100}%, #e2e8f0 ${r * 100}% 100%)` }}>
                <div className="grid h-[60px] w-[60px] place-items-center rounded-full bg-white text-lg font-black">{pct(r)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="kick">{k.full_name} · {k.sections!.classes.name}</div>
                <h2 className="h2">Road to the final</h2>
                <p className="muted text-sm">{behind ? `${behind} subject${behind > 1 ? "s are" : " is"} a little behind the school's plan.` : "All subjects are on track with the school's plan."}</p>
              </div>
            </div>
            {todays.length > 0 && <div className="rounded-xl p-3" style={{ background: "#e0f2fe" }}>
              <div className="kick">{nextDay === today ? "Today" : shortDate(nextDay!)} in class</div>
              {todays.map((l, i) => <div key={i} className="flex gap-2 text-sm"><b className="w-24 flex-none">{l.subjects.name}</b><span>{l.topic}{l.pages ? ` · p ${l.pages}` : ""}</span></div>)}
              <Link href={tutor} className="btn mt-2 min-h-10 px-3 text-sm">Explain this lesson (AI tutor)</Link>
            </div>}
            <div className="flex flex-col gap-2">
              {mine.map((b) => {
                const x = P.get(b.id);
                const st = x ? statusOf(x.done, x.should) : "ok";
                return (
                  <div key={b.id}>
                    <div className="flex justify-between text-sm font-extrabold"><span>{b.subjects.name}{x ? ` · Ch ${x.at_chapter || 1} of ${x.chapters}` : ""}</span>
                      <span style={{ color: st === "ok" ? "#15803d" : "#b45309" }}>{st === "ok" ? "on track" : `${(x?.should ?? 0) - (x?.done ?? 0)} behind`}</span></div>
                    <Bar value={x ? x.done / (x.total || 1) : 0} color={st === "ok" ? "#16a34a" : "#f59e0b"} />
                  </div>
                );
              })}
            </div>
            {tests.length > 0 && <div className="flex flex-col gap-1.5">
              <b className="text-sm">Class tests coming</b>
              {tests.map((t, i) => <div key={i} className="flex justify-between gap-2 rounded-xl p-2 text-sm font-bold" style={{ background: "var(--page)" }}><span>{shortDate(t.planned_on)} · {t.subjects.name}</span><span>{t.topic}</span></div>)}
            </div>}
          </section>
        );
      })}
    </div>
  );
}
