import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireRole } from "@/lib/me";
import { loadSheets, loadTest, maxMarksOf, testLabel } from "@/lib/paper-check/data";
import { BUBBLE_R, MARKERS, MARKER_SIZE, OPTION_LETTERS, PAGE_H, PAGE_W, QR_BOX, buildSheetLayout, sheetQrPayload } from "@/lib/paper-check/layout";
import { PrintButton } from "./print-button";

const mm = (v: number) => `${v}mm`;

// A4 answer sheets, one per student. Positions come from the shared layout so the scanner can read them.
export default async function PrintSheetsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("teacher", "principal", "owner");
  const { id } = await params;
  const test = await loadTest(id);
  if (!test) notFound();
  const sheets = await loadSheets(id);
  const layout = buildSheetLayout(test.mcq_key.length, test.options_per_mcq, test.questions.length);
  const codes = await Promise.all(
    sheets.map((s) => QRCode.toString(sheetQrPayload(test.id, s.student_id), { type: "svg", margin: 0, errorCorrectionLevel: "M" })),
  );

  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{`@page { size: A4; margin: 0; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; break-after: page; } } .sheet svg { width: 100%; height: 100%; }`}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "210mm" }}>
        <div className="text-sm">{sheets.length} sheets. Print at 100% (not &quot;fit to page&quot;) on A4. Students fill bubbles fully with a dark pen.</div>
        <PrintButton />
      </div>
      {sheets.map((s, i) => (
        <div key={s.id} className="sheet relative mx-auto mb-6 overflow-hidden bg-white text-black shadow-lg" style={{ width: mm(PAGE_W), height: mm(PAGE_H) }}>
          {Object.values(MARKERS).map((m, k) => (
            <div key={k} className="absolute bg-black" style={{ left: mm(m.x), top: mm(m.y), width: mm(MARKER_SIZE), height: mm(MARKER_SIZE) }} />
          ))}
          <div className="absolute" style={{ left: mm(22), top: mm(10), width: mm(120) }}>
            <div style={{ fontSize: "13pt", fontWeight: 800 }}>{test.title}</div>
            <div style={{ fontSize: "9pt" }}>{testLabel(test)} · {test.test_date} · Total {maxMarksOf(test)}</div>
          </div>
          <div className="absolute border border-black" style={{ left: mm(22), top: mm(24), width: mm(120), height: mm(28), padding: "2mm", fontSize: "10pt" }}>
            <div>Name: <b>{s.students?.full_name}</b></div>
            <div>Roll No: <b>{s.students?.roll_no ?? ""}</b></div>
            <div style={{ fontSize: "8pt", marginTop: "2mm" }}>Fill one bubble per MCQ completely. Write answers only inside the boxes. Do not fold.</div>
          </div>
          <div className="absolute" style={{ left: mm(QR_BOX.x), top: mm(QR_BOX.y), width: mm(QR_BOX.size), height: mm(QR_BOX.size) }}
            dangerouslySetInnerHTML={{ __html: codes[i] }} />
          {layout.rowLabels.map((r) => (
            <div key={`l${r.question}`} className="absolute" style={{ left: mm(r.x), top: mm(r.y - 2), fontSize: "8pt", width: mm(6), textAlign: "right" }}>{r.question}</div>
          ))}
          {layout.bubbles.map((b) => (
            <div key={`${b.question}-${b.option}`} className="absolute flex items-center justify-center rounded-full border border-black"
              style={{ left: mm(b.cx - BUBBLE_R), top: mm(b.cy - BUBBLE_R), width: mm(BUBBLE_R * 2), height: mm(BUBBLE_R * 2), fontSize: "5.5pt", color: "#888" }}>
              {OPTION_LETTERS[b.option]}
            </div>
          ))}
          {layout.answerBoxes.map((box) => {
            const q = test.questions.find((x) => x.no === box.no);
            return (
              <div key={box.no} className="absolute border border-black" style={{ left: mm(box.x), top: mm(box.y), width: mm(box.w), height: mm(box.h) }}>
                <div style={{ fontSize: "8pt", padding: "1mm 2mm", borderBottom: "0.2mm solid #999" }}>Q{box.no} ({q?.maxMarks} marks): {q?.prompt}</div>
              </div>
            );
          })}
          <div className="absolute" style={{ left: mm(22), bottom: mm(9), fontSize: "7pt", color: "#555" }}>ilmora answer sheet · checked by your teacher</div>
        </div>
      ))}
    </div>
  );
}
