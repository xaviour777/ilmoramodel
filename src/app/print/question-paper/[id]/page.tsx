import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { isUrdu, totalMarks, type PaperItem, type Pattern } from "@/lib/question-paper";
import { PrintButton } from "../../paper-check/[id]/print-button";

const PRINT_CSS = `@page { size: A4; margin: 0; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; } }`;
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];
const LETTERS = "ABCDE";

// A board-style paper on A4. With ?key=1 it prints the answer key instead.
export default async function PrintQuestionPaper({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string }> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const { id } = await params;
  const key = (await searchParams).key === "1";
  const supabase = await createClient();
  const [{ data: paper }, { data: campus }] = await Promise.all([
    supabase.from("question_papers").select("title, pattern, items, minutes, classes(name), subjects(name)").eq("id", id).maybeSingle(),
    supabase.from("campuses").select("name, schools(name)").eq("id", me.campus_id).maybeSingle(),
  ]);
  if (!paper) notFound();
  const items = paper.items as PaperItem[];
  const p = paper.pattern as Pattern;
  const cls = paper.classes as unknown as { name: string } | null;
  const subject = paper.subjects as unknown as { name: string } | null;
  const school = (campus?.schools as unknown as { name: string } | null)?.name ?? "";
  const urdu = isUrdu(items.map((i) => i.question).join(" "));
  const mcqs = items.filter((i) => i.section === "A");
  const groups = [...new Set(items.filter((i) => i.section === "B").map((i) => i.qno))];
  const longs = items.filter((i) => i.section === "C");
  const head = { fontWeight: 800, margin: "4mm 0 2mm" } as const;

  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "210mm" }}>
        <div className="text-sm">{key ? "Answer key, for teachers only." : "Question paper."} Use your browser&apos;s print, A4.</div>
        <PrintButton />
      </div>
      <div className="sheet mx-auto bg-white text-black shadow" dir={urdu ? "rtl" : "ltr"}
        style={{ width: "210mm", minHeight: "297mm", padding: "12mm 15mm", fontSize: "11pt", lineHeight: 1.45 }}>
        <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: "3mm", marginBottom: "3mm" }}>
          {school && <div style={{ fontSize: "15pt", fontWeight: 800 }}>{school}</div>}
          <div style={{ fontWeight: 700 }}>{campus?.name}</div>
          <div style={{ fontSize: "13pt", fontWeight: 800, marginTop: "1mm" }}>{paper.title}{key ? " · ANSWER KEY" : ""}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "2mm 6mm", fontWeight: 700, marginBottom: "2mm" }}>
          <span>Class: {cls?.name}</span><span>Subject: {subject?.name}</span><span>Time: {paper.minutes} minutes</span><span>Total marks: {totalMarks(p)}</span>
        </div>
        {!key && <div style={{ display: "flex", gap: "8mm", marginBottom: "2mm" }}><span>Name: ____________________</span><span>Roll no: ________</span></div>}

        {mcqs.length > 0 && (
          <>
            <div style={head}>Section A (Objective) · Q1. Choose the correct answer. ({mcqs.length} × {p.mcq.marks} = {mcqs.length * p.mcq.marks} marks)</div>
            {key ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2mm 6mm" }}>{mcqs.map((m, i) => <span key={i}><b>{i + 1}.</b> {m.answer}</span>)}</div>
            ) : (
              <ol style={{ paddingInlineStart: "6mm" }}>
                {mcqs.map((m, i) => (
                  <li key={i} style={{ marginBottom: "2mm", breakInside: "avoid" }}>
                    <div>{m.question}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "1mm 8mm" }}>{m.options.map((o, k) => <span key={k}>({LETTERS[k]}) {o}</span>)}</div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        {groups.length > 0 && <div style={head}>Section B (Short questions) · {groups.length * p.short.attempt * p.short.marks} marks</div>}
        {groups.map((g) => {
          const qs = items.filter((i) => i.section === "B" && i.qno === g);
          return (
            <div key={g} style={{ marginBottom: "3mm" }}>
              <div style={{ fontWeight: 700 }}>Q{g}. Write short answers to any {p.short.attempt} questions. ({p.short.attempt} × {p.short.marks} = {p.short.attempt * p.short.marks})</div>
              {qs.map((q, i) => (
                <div key={i} style={{ display: "flex", gap: "3mm", breakInside: "avoid", marginTop: "1mm" }}>
                  <span style={{ minWidth: "7mm" }}>({ROMAN[i] ?? i + 1})</span>
                  <div>{q.question}{key && q.answer && <div style={{ fontSize: "10pt", color: "#333" }}>Answer: {q.answer}</div>}</div>
                </div>
              ))}
            </div>
          );
        })}

        {longs.length > 0 && <div style={head}>Section C (Long questions) · Attempt any {p.long.attempt}. ({p.long.attempt} × {p.long.marks} = {p.long.attempt * p.long.marks})</div>}
        {longs.map((q) => (
          <div key={q.qno} style={{ display: "flex", gap: "3mm", breakInside: "avoid", marginBottom: "2mm" }}>
            <b style={{ minWidth: "9mm" }}>Q{q.qno}.</b>
            <div>{q.question} <b>({q.marks})</b>{key && q.answer && <div style={{ fontSize: "10pt", color: "#333", whiteSpace: "pre-wrap" }}>Answer: {q.answer}</div>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
