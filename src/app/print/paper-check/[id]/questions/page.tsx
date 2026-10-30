import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { loadTest, maxMarksOf, testLabel } from "@/lib/paper-check/data";
import { OPTION_LETTERS } from "@/lib/paper-check/layout";
import { PrintButton } from "../print-button";

const PRINT_CSS = `@page { size: A4; margin: 0; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; } }`;

// The question paper that goes with the answer sheets: MCQs with their options, then the written questions.
// Students mark MCQ answers on their own answer sheet, so one paper can be shared or printed for each.
export default async function PrintQuestionPaper({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("teacher", "principal", "owner");
  const { id } = await params;
  const test = await loadTest(id);
  if (!test) notFound();
  const urdu = /[؀-ۿ]/.test(JSON.stringify(test.mcq_questions) + JSON.stringify(test.questions));

  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "210mm" }}>
        <div className="text-sm">Question paper. Students fill MCQ bubbles on their answer sheet and write the answers in its boxes.</div>
        <PrintButton />
      </div>
      <div className="sheet mx-auto bg-white text-black shadow" dir={urdu ? "rtl" : "ltr"}
        style={{ width: "210mm", minHeight: "297mm", padding: "14mm 16mm", fontSize: "11.5pt", lineHeight: 1.45 }}>
        <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: "3mm", marginBottom: "4mm" }}>
          <div style={{ fontSize: "15pt", fontWeight: 800 }}>{test.title}</div>
          <div>{testLabel(test)} · {test.test_date} · Total marks {maxMarksOf(test)}</div>
        </div>
        {test.mcq_questions.length > 0 && (
          <>
            <div style={{ fontWeight: 800, marginBottom: "2mm" }}>Section A: MCQs ({test.mcq_questions.length} × {Number(test.mcq_marks_each)} marks). Fill the right bubble on your answer sheet.</div>
            <ol style={{ paddingInlineStart: "6mm", marginBottom: "5mm" }}>
              {test.mcq_questions.map((m, i) => (
                <li key={i} style={{ marginBottom: "2.5mm", breakInside: "avoid" }}>
                  <div>{m.q}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "2mm 8mm" }}>
                    {m.options.map((o, k) => <span key={k}>({OPTION_LETTERS.at(k)}) {o}</span>)}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
        {test.questions.length > 0 && (
          <>
            <div style={{ fontWeight: 800, marginBottom: "2mm" }}>Section B: Written questions. Write each answer in its box on the answer sheet.</div>
            <ol style={{ paddingInlineStart: "6mm" }}>
              {test.questions.map((q) => (
                <li key={q.no} style={{ marginBottom: "2.5mm", breakInside: "avoid" }}>
                  {q.prompt} <b>({q.maxMarks} marks)</b>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
