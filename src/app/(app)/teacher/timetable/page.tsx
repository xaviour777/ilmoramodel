import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { WeekGrid } from "@/components/week-grid";
import { liveWeek, weekdayOf } from "@/lib/timetable";
import { todayPK } from "@/lib/format";
import { myTimetableAsk, TimetableAsk } from "@/components/timetable-ask";

type Search = { saved?: string; error?: string };

// The teacher's own week. While the principal is asking, the teacher accepts it or reports a problem.
export default async function TeacherTimetable({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("teacher", "principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const [cells, ack] = await Promise.all([liveWeek(supabase, { teacher: me.id }), myTimetableAsk(supabase, me.id)]);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">My timetable</h1>
          <p className="muted text-base">{cells.length} periods a week · <Link href="/teacher" className="font-extrabold">Back to attendance</Link></p>
        </div>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">{sp.saved === "accepted" ? "Thank you. The principal can see that you accepted." : sp.saved === "issue" ? "Sent to the principal." : "This timetable is already confirmed."}</div>}
      {ack && <TimetableAsk ack={ack} />}
      <section className="card">
        <h2 className="h2">Week</h2>
        <WeekGrid cells={cells} show="section" today={weekdayOf(todayPK())} />
      </section>
    </>
  );
}
