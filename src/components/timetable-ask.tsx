import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/format";
import { answerTimetable } from "@/app/(app)/teacher/actions";

export type TimetableAskRow = { round_id: string; status: string; note: string | null; timetable_rounds: { message: string | null; sent_at: string; status: string } | null };

// The latest round still under review that has a line for this teacher.
export async function myTimetableAsk(supabase: Awaited<ReturnType<typeof createClient>>, meId: string) {
  const { data } = await supabase.from("timetable_acks").select("round_id, status, note, timetable_rounds!inner(message, sent_at, status)")
    .eq("teacher_id", meId).eq("timetable_rounds.status", "review").limit(1).maybeSingle();
  return (data as unknown as TimetableAskRow | null) ?? null;
}

export function TimetableAsk({ ack, compact }: { ack: TimetableAskRow; compact?: boolean }) {
  const r = ack.timetable_rounds;
  return (
    <section className="card" style={{ borderColor: ack.status === "pending" ? "var(--orange)" : undefined }}>
      <h2 className="h2">{ack.status === "pending" ? "Please check your new timetable" : ack.status === "accepted" ? "You accepted the new timetable" : "You reported a problem"}</h2>
      <p className="muted">Sent by the principal {r ? shortDate(r.sent_at.slice(0, 10)) : ""}.{r?.message ? ` ${r.message}` : ""} It reaches parents after the principal confirms it.</p>
      {ack.note && <div className="text-sm font-bold">Your note: {ack.note}</div>}
      {compact ? (
        <Link href="/teacher/timetable" className="btn self-start">{ack.status === "pending" ? "Check and accept" : "See my week"}</Link>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <form action={answerTimetable}>
            <input type="hidden" name="round_id" value={ack.round_id} /><input type="hidden" name="status" value="accepted" />
            <button className="btn" type="submit">Accept</button>
          </form>
          <form action={answerTimetable} className="flex flex-1 flex-wrap items-end gap-2">
            <input type="hidden" name="round_id" value={ack.round_id} /><input type="hidden" name="status" value="issue" />
            <label className="field flex-1">What needs to change?<input className="input" name="note" required defaultValue={ack.status === "issue" ? ack.note ?? "" : ""} placeholder="e.g. Tuesday period 3 clashes with my 10-B lab" /></label>
            <button className="btn-ghost" type="submit">Report a problem</button>
          </form>
        </div>
      )}
    </section>
  );
}
