import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { shortDate, time, todayPK } from "@/lib/format";

type Kid = { id: string; full_name: string; section_id: string | null; sections: { name: string; class_id: string; classes: { name: string } } | null };

// For parents and students: each child's coming papers, admit card and report card.
export async function FamilyExams({ kids }: { kids: Kid[] }) {
  const supabase = await createClient();
  const today = todayPK();
  const classIds = [...new Set(kids.map((k) => k.sections?.class_id).filter(Boolean))] as string[];
  const [{ data: papers }, { data: bal }] = await Promise.all([
    classIds.length ? supabase.from("exam_papers").select("exam_id, class_id, paper_date, starts_at, ends_at, subjects(name), exams(name, status)").in("class_id", classIds).gte("paper_date", today).order("paper_date").order("starts_at") : Promise.resolve({ data: [] }),
    supabase.from("family_balances").select("balance_paisa"),
  ]);
  type P = { exam_id: string; class_id: string; paper_date: string; starts_at: string | null; ends_at: string | null; subjects: { name: string }; exams: { name: string; status: string } };
  const P = (papers ?? []) as unknown as P[];
  const owes = (bal ?? []).some((b) => Number(b.balance_paisa) > 0);
  if (!kids.length) return <p className="muted">No children linked to this account yet.</p>;
  return (
    <div className="flex flex-col gap-5">
      {owes && <div className="notice-warn">There are unpaid fees, so the school holds admit cards until they are paid. <Link href="/parent/fees" className="underline">Fees</Link></div>}
      {kids.map((k) => {
        const mine = P.filter((p) => p.class_id === k.sections?.class_id);
        const exams = [...new Map(mine.map((p) => [p.exam_id, p.exams.name])).entries()];
        return (
          <section key={k.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">{k.full_name}{k.sections ? ` · ${k.sections.classes.name}-${k.sections.name}` : ""}</h2>
              <Link href={`/print/report-card/${k.id}`} target="_blank" className="btn-ghost min-h-10 px-3 text-sm">Report card</Link>
            </div>
            {exams.length === 0 && <p className="muted">No papers coming up. The date sheet shows here when the school puts it out.</p>}
            {exams.map(([id, name]) => (
              <div key={id} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2"><b>{name}</b>
                  <Link href={`/print/admit/${k.id}?exam=${id}`} target="_blank" className="btn min-h-10 px-3 text-sm">Admit card</Link></div>
                {mine.filter((p) => p.exam_id === id).map((p, i) => (
                  <div key={i} className="flex justify-between gap-2 rounded-xl p-2 text-sm font-bold" style={{ background: "var(--page)" }}>
                    <span>{shortDate(p.paper_date)} · {p.subjects.name}</span><span className="tabular-nums">{time(p.starts_at)}{p.ends_at ? `–${time(p.ends_at)}` : ""}</span>
                  </div>
                ))}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
