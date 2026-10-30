import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { listTests, testLabel } from "@/lib/paper-check/data";
import { shortDate } from "@/lib/format";
import { getLearningAi } from "@/lib/ai";

const STATUS: Record<string, [string, string]> = {
  checking: ["Checking", "pill-blue"],
  submitted: ["Waiting for principal", "pill-orange"],
  approved: ["Results out", "pill-green"],
};

export default async function PaperCheckPage() {
  await requireRole("teacher", "principal", "owner");
  const supabase = await createClient();
  const tests = await listTests();
  const { data: sheets } = tests.length
    ? await supabase.from("paper_sheets").select("test_id, status").in("test_id", tests.map((t) => t.id))
    : { data: [] };
  const count = (id: string, pred: (s: string) => boolean) => (sheets ?? []).filter((s) => s.test_id === id && pred(s.status)).length;
  const demo = (await getLearningAi(supabase)).name === "demo";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="h1">Paper checking</h1>
          <p className="muted text-base">Print answer sheets, scan them with your phone, and check the whole class in minutes. MCQs are marked automatically. AI only suggests marks for written answers: you decide.</p>
        </div>
        <Link href="/teacher/paper-check/new" className="btn">New test</Link>
      </div>
      {demo && <div className="notice-warn">Demo AI is on. MCQs are read from the photo, but you mark the written answers yourself until the real AI key is added.</div>}
      <section className="card">
        {tests.length === 0 && <p className="muted">No tests yet. Create one, print the sheets, and scan them after the test.</p>}
        {tests.map((t) => {
          const total = count(t.id, () => true);
          const done = count(t.id, (s) => s === "reviewed" || s === "absent");
          const scanned = count(t.id, (s) => s !== "pending");
          const [label, cls] = STATUS[t.status];
          return (
            <Link key={t.id} href={`/teacher/paper-check/${t.id}`} className="row-box">
              <div className="min-w-0 flex-1">
                <div className="truncate font-extrabold">{t.title}</div>
                <div className="muted text-xs">{testLabel(t)} · {shortDate(t.test_date)} · scanned {scanned}/{total} · checked {done}/{total}</div>
              </div>
              <span className={`pill ${cls}`}>{label}</span>
            </Link>
          );
        })}
      </section>
    </>
  );
}
