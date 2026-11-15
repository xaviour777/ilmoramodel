import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";

// Every AI feature in one place (design/AITools.dc.html). Each card opens an existing page.
export default async function PrincipalAiTools() {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const [tests, checked, waiting, tutor, papers, bank] = await Promise.all([
    supabase.from("paper_tests").select("id", { count: "exact", head: true }),
    supabase.from("paper_sheets").select("id", { count: "exact", head: true }).in("status", ["scanned", "reviewed"]),
    supabase.from("paper_tests").select("id, title, status, sections(name, classes(name)), subjects(name)").eq("status", "submitted").order("test_date", { ascending: false }).limit(5),
    supabase.from("tutor_sessions").select("id", { count: "exact", head: true }),
    supabase.from("question_papers").select("id", { count: "exact", head: true }),
    supabase.from("question_bank").select("id", { count: "exact", head: true }),
  ]);
  const sheets = checked.count ?? 0;
  const hours = Math.round((sheets * 8) / 60);
  type W = { id: string; title: string; sections: { name: string; classes: { name: string } } | null; subjects: { name: string } | null };
  const pending = (waiting.data ?? []) as unknown as W[];

  const tools = [
    { href: "/teacher/paper-check", tile: "t-y", title: "Paper checking", body: "Scan answer sheets. MCQs are marked at once; written answers get AI marks for the teacher to approve." },
    { href: "/teacher/paper-check/papers", tile: "t-v", title: "Question papers", body: "Make a board-style paper from the question bank, chapter by chapter." },
    { href: "/teacher/paper-check/bank", tile: "t-b", title: "Question bank", body: "Questions by class, subject and chapter, with AI help to add more." },
    { href: "/teacher/tutor-report", tile: "t-g", title: "Tutor reports", body: "What each child asked the homework tutor and where they got stuck." },
    { href: "/principal/notices", tile: "t-p", title: "Notice writer", body: "Write a notice in English or Urdu with AI, then send it to app, WhatsApp or SMS." },
    { href: "/settings/ai", tile: "t-n", title: "AI settings", body: "Keys, monthly limit and which features are switched on." },
  ];

  return (
    <>
      <div>
        <div className="kick">Academics</div>
        <h1 className="h1 mt-1">AI tools</h1>
        <p className="muted mt-1.5 text-[15px]">Paper checking, question papers and tutor reports. Teachers always approve AI marks before parents see them.</p>
      </div>

      <section className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Stat label="Papers checked" value={sheets.toLocaleString("en-IN")} sub={`${tests.count ?? 0} tests`} />
        <Stat label="Teacher hours saved" value={String(hours)} sub="about 8 min per paper" />
        <Stat label="Question papers" value={String(papers.count ?? 0)} sub={`${bank.count ?? 0} questions in the bank`} />
        <Stat label="Tutor sessions" value={(tutor.count ?? 0).toLocaleString("en-IN")} sub="homework help asked" />
      </section>

      <section className="flex flex-wrap items-start gap-5">
        <div className="grid min-w-0 flex-[3_1_540px] gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {tools.map((t) => (
            <Link key={t.href} href={t.href} className="card flex flex-col gap-2 hover:border-[#7dd3fc]">
              <span className={`ilm-tile ${t.tile}`} style={{ width: 48, height: 48, borderRadius: 14 }}>
                <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg></span>
              <span className="text-[17px] font-black">{t.title}</span>
              <span className="muted text-[14px]">{t.body}</span>
            </Link>
          ))}
        </div>
        <div className="card min-w-0 flex-[2_1_320px]">
          <h2 className="h2">Waiting for your approval</h2>
          <p className="muted text-[13px]">Tests a teacher has submitted after checking</p>
          {pending.length === 0 && <p className="muted mt-3">Nothing waiting.</p>}
          {pending.map((p) => (
            <Link key={p.id} href={`/teacher/paper-check/${p.id}`} className="flex items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2.5">
              <div className="min-w-0 flex-1"><div className="truncate font-black">{p.title}</div>
                <div className="muted text-[12px]">{[p.subjects?.name, p.sections ? `${p.sections.classes.name}-${p.sections.name}` : ""].filter(Boolean).join(" · ")}</div></div>
              <span className="tagx y">Review</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="kick">{label}</div>
      <div className="mt-1 text-[30px] leading-9 font-black tabular-nums">{value}</div>
      <div className="muted text-[13px]">{sub}</div>
    </div>
  );
}
