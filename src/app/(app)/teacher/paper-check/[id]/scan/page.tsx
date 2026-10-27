import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { loadSheets, loadTest } from "@/lib/paper-check/data";
import { Scanner } from "./scanner";

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("teacher", "principal", "owner");
  const { id } = await params;
  const test = await loadTest(id);
  if (!test) notFound();
  const sheets = await loadSheets(id);
  return (
    <>
      <div>
        <Link href={`/teacher/paper-check/${id}`} className="muted text-sm underline">{test.title}</Link>
        <h1 className="h1">Scan papers</h1>
        <p className="muted text-base">Put each sheet flat in good light and take the photo from straight above so all 4 black corners show. You can also pick many photos at once from the gallery.</p>
      </div>
      {test.status !== "checking" ? (
        <div className="notice-warn">This test is already sent to the principal, so papers can&apos;t be scanned again.</div>
      ) : (
        <Scanner
          testId={test.id}
          mcqCount={test.mcq_key.length}
          optionsPerMcq={test.options_per_mcq}
          writtenCount={test.questions.length}
          students={sheets.map((s) => ({ id: s.student_id, name: s.students?.full_name ?? "Student", roll: s.students?.roll_no ?? "", pending: s.status === "pending" }))}
        />
      )}
    </>
  );
}
