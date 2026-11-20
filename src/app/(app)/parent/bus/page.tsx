import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { Empty } from "@/components/ilm";
import { mapLink, mapSrc } from "@/lib/transport";
import { AutoRefresh } from "./refresh";

type Bus = {
  van: string; plate: string | null; driver: string | null; driver_phone: string | null; attendant: string | null; attendant_phone: string | null;
  route: string | null; stop: string | null; pickup: string | null; drop: string | null; stop_lat: number | null; stop_lng: number | null;
  trip: { leg: string; status: string; started_at: string | null; ended_at: string | null; lat: number | null; lng: number | null; seen_at: string | null } | null;
  events: { kind: string; at: string; leg: string }[];
};
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" }) : "");
const WHAT: Record<string, string> = { boarded: "Got on the van", dropped: "Got off the van", absent: "Marked absent on the van" };

// A parent sees only their own child's van: driver, stop, today's pick-up and drop times,
// and where the van is while the trip is on the road.
export default async function ParentBus({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  await requireRole("parent", "student");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: kids } = await supabase.from("students").select("id, full_name").eq("status", "enrolled").order("full_name");
  const child = (kids ?? []).find((k) => k.id === sp.child) ?? (kids ?? [])[0];
  const { data } = child ? await supabase.rpc("my_child_bus", { p_student: child.id }) : { data: null };
  const bus = data as Bus | null;
  const live = bus?.trip?.status === "open" && bus.trip.lat != null && bus.trip.lng != null;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="kick">School van</div><h1 className="h1 mt-1">{child ? `${child.full_name.split(" ")[0]}'s van` : "School van"}</h1></div>
        {bus?.trip?.status === "open" && <AutoRefresh seconds={30} />}
      </div>
      {(kids ?? []).length > 1 && <div className="flex flex-wrap gap-2">{(kids ?? []).map((k) => <Link key={k.id} href={`/parent/bus?child=${k.id}`} className={`pill ${k.id === child?.id ? "pill-blue" : "pill-gray"}`}>{k.full_name}</Link>)}</div>}
      {!bus ? <Empty>{child ? `${child.full_name} does not use the school van.` : "No child found."}</Empty> : (
        <div className="grid gap-5 xl:grid-cols-[3fr_2fr] xl:items-start">
          <section className="card flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">{bus.van}{bus.plate ? ` · ${bus.plate}` : ""}</h2>
              <span className={`pill ${bus.trip?.status === "open" ? "pill-green" : "pill-gray"}`}>{bus.trip?.status === "open" ? `${bus.trip.leg} trip on the way` : bus.trip ? `${bus.trip.leg} trip finished ${hhmm(bus.trip.ended_at)}` : "No trip yet today"}</span>
            </div>
            {live ? (
              <>
                <iframe title="Where the van is" src={mapSrc(bus.trip!.lat!, bus.trip!.lng!)} className="h-72 w-full rounded-xl border-2 border-[#e5e7eb]" loading="lazy" />
                <p className="muted text-sm">Updated {hhmm(bus.trip!.seen_at)}. This page refreshes by itself. <a className="underline" href={mapLink(bus.trip!.lat!, bus.trip!.lng!)} target="_blank" rel="noreferrer">Open in Google Maps</a></p>
              </>
            ) : bus.trip?.status === "open" ? <p className="muted">The trip has started. The van&apos;s location shows here once the driver&apos;s phone finds GPS.</p>
              : <p className="muted">The van&apos;s location shows here only while a trip is on the road. It is never shared at other times.</p>}
          </section>
          <div className="flex flex-col gap-5">
            <section className="card flex flex-col gap-1.5">
              <h2 className="h2">Today</h2>
              {bus.events.length === 0 && <p className="muted">Nothing yet.</p>}
              {bus.events.map((e, i) => <div key={i} className="flex justify-between font-bold"><span>{WHAT[e.kind] ?? e.kind} <span className="muted">({e.leg})</span></span><span className="tabular-nums">{hhmm(e.at)}</span></div>)}
            </section>
            <section className="card flex flex-col gap-1.5 text-sm font-bold">
              <h2 className="h2">Details</h2>
              <div>Route: {bus.route ?? "—"}</div>
              <div>Stop: {bus.stop ?? "—"}{bus.pickup ? ` · pick-up ${bus.pickup}` : ""}{bus.drop ? ` · drop ${bus.drop}` : ""}</div>
              {bus.stop_lat != null && bus.stop_lng != null && <a className="underline" href={mapLink(bus.stop_lat, bus.stop_lng)} target="_blank" rel="noreferrer">Stop on the map</a>}
              <div className="mt-1 flex flex-wrap gap-2">
                {bus.driver_phone && <a href={`tel:${bus.driver_phone}`} className="btn-ghost" style={{ minHeight: 40 }}>Call driver{bus.driver ? ` (${bus.driver})` : ""}</a>}
                {bus.attendant_phone && <a href={`tel:${bus.attendant_phone}`} className="btn-ghost" style={{ minHeight: 40 }}>Call helper{bus.attendant ? ` (${bus.attendant})` : ""}</a>}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
