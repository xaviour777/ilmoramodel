import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Verify a result" };

// Opened from the QR on a printed result card. Confirms the card only with the code it carries.
export default async function VerifyPage({ params, searchParams }: { params: Promise<{ roll: string }>; searchParams: Promise<{ c?: string }> }) {
  const { roll } = await params;
  const { c } = await searchParams;
  const supabase = await createClient();
  const { data } = c ? await supabase.rpc("verify_result", { p_roll: decodeURIComponent(roll), p_code: c }) : { data: null };
  const r = data as { student: string; roll: string; exam: string; school: string; percent: number } | null;
  return (
    <main className="ilm mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-10">
      {r ? (
        <div className="card text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#dcfce7] text-[28px] font-black text-[#15803d]">✓</div>
          <h1 className="h1 mt-2" style={{ fontSize: 26 }}>Genuine result</h1>
          <p className="muted mt-1">This card was issued by {r.school}.</p>
          <div className="mt-3 grid gap-1 text-left">
            {[["Student", r.student], ["Student ID", r.roll], ["Exam", r.exam], ["Percentage", r.percent != null ? `${r.percent}%` : "—"]].map(([l, v]) => <div key={l} className="flex justify-between border-t-2 border-[#f1f5f9] py-2"><span className="muted">{l}</span><b>{v}</b></div>)}
          </div>
          <p className="muted mt-2 text-[12px]">If these don&apos;t match the paper card, the card has been changed.</p>
        </div>
      ) : (
        <div className="card text-center">
          <h1 className="h1" style={{ fontSize: 26 }}>Can&apos;t verify this card</h1>
          <p className="muted mt-1">The code on the card doesn&apos;t match any published result. Scan the QR again, or ask the school.</p>
        </div>
      )}
    </main>
  );
}
