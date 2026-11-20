import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { todayPK } from "@/lib/format";
import { DriverBoard, type Board } from "./board";

// The driver's phone: today's trip board. Works without internet once opened (marks wait on
// the phone and go when the signal is back), shares location only while a trip is open.
export default async function DriverPage() {
  const me = await requireRole("driver", "principal", "owner");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("driver_board", { p_date: todayPK() });
  return (
    <>
      <div>
        <div className="kick">Trip board</div>
        <h1 className="h1 mt-1">Assalam-o-Alaikum, {me.full_name.split(" ")[0]}</h1>
        <p className="muted text-[15px]">Start the trip, tick each child when they get on and off, and keep this screen open so parents can see the van.</p>
      </div>
      {error ? <div className="notice-bad">{error.message}</div> : <DriverBoard initial={data as Board} driverId={me.id} />}
    </>
  );
}
