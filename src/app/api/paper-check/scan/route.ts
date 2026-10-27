import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLearningAi } from "@/lib/ai";
import { scoreMcq, sheetFlags, type McqAnswer } from "@/lib/paper-check/omr";
import type { AiSuggestion, WrittenAnswer } from "@/lib/paper-check/rubric";
import { loadTest, settleSheet } from "@/lib/paper-check/data";

type Body = {
  testId: string;
  studentId: string;
  mcqAnswers: McqAnswer[];
  qrRead: boolean;
  blurry: boolean;
  crops: Array<{ no: number; dataUrl: string }>; // straightened answer boxes, small grayscale JPEGs
};

const MAX_CROP = 400_000; // bytes of data URL per answer box

// One scanned sheet from the teacher's phone: MCQ score from the bubbles, answer crops and AI suggestions.
// Row-level security decides whether this person may check this test.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.testId || !body.studentId) return NextResponse.json({ error: "Missing test or student" }, { status: 400 });
  const supabase = await createClient();
  const test = await loadTest(body.testId);
  if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 });
  if (test.status !== "checking") return NextResponse.json({ error: "This test is already submitted" }, { status: 409 });

  const { data: sheet } = await supabase
    .from("paper_sheets")
    .select("id")
    .eq("test_id", test.id)
    .eq("student_id", body.studentId)
    .maybeSingle();
  if (!sheet) return NextResponse.json({ error: "This student is not in the test's section" }, { status: 404 });

  const answers = (body.mcqAnswers ?? []).slice(0, test.mcq_key.length);
  const mcq = scoreMcq(test.mcq_key, answers, Number(test.mcq_marks_each));
  const flags = sheetFlags(mcq, { qrMissing: !body.qrRead, blurry: body.blurry });

  const ai = getLearningAi();
  const written: WrittenAnswer[] = [];
  for (const q of test.questions) {
    const crop = body.crops?.find((c) => c.no === q.no && c.dataUrl.startsWith("data:image/jpeg;base64,") && c.dataUrl.length < MAX_CROP);
    let suggestion: AiSuggestion;
    try {
      suggestion = await ai.suggestWrittenMarks(q, {
        imageBase64: crop && ai.name === "claude" ? crop.dataUrl.split(",")[1] : null,
        transcript: null,
      });
    } catch (err) {
      suggestion = {
        marks: null,
        matchedPoints: [],
        missingPoints: q.rubric.map((p) => p.point),
        reason: `AI could not check this answer (${err instanceof Error ? err.message : "error"}). Please mark it.`,
        confidence: 0,
        provider: ai.name,
      };
    }
    written.push({ no: q.no, cropUrl: crop?.dataUrl ?? null, ai: suggestion, finalMarks: null, overridden: false });
  }
  if (written.some((w) => w.ai?.marks == null)) flags.push("NEEDS_TEACHER_MARKS");

  const settled = settleSheet(test.questions, written, mcq.score, flags);
  const { error } = await supabase
    .from("paper_sheets")
    .update({
      mcq_answers: answers,
      mcq_score: mcq.score,
      flags: settled.flags,
      answers: written,
      total: settled.total,
      status: settled.status,
      scanned_at: new Date().toISOString(),
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", sheet.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ sheetId: sheet.id, mcq, flags: settled.flags, status: settled.status });
}
