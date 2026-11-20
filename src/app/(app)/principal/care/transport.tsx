import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { rupees, todayPK } from "@/lib/format";
import { Empty } from "@/components/ilm";
import { LiveRefresh } from "@/components/live-refresh";
import { mapLink, mapSrc } from "@/lib/transport";
import { addDriver, addStop, addVehicleCost, answerSos, assignRider, deleteStop, saveRoute, saveVehicle, setDriverLogin } from "./transport-actions";

type Search = { t?: string; van?: string; route?: string; login?: string };
const SUB = [["live", "Today"], ["routes", "Routes & stops"], ["vehicles", "Vehicles & drivers"], ["riders", "Students"], ["costs", "Running costs"]] as const;
const ago = (iso: string | null) => { if (!iso) return "never"; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" }) : "—");
const COST: Record<string, string> = { fuel: "Fuel", maintenance: "Maintenance", repair: "Repair", token_tax: "Token tax", insurance: "Insurance", driver_pay: "Driver / helper pay", other: "Other" };

// Transport: today's trips with live location, custody and SOS; routes and stops; vehicles and
// drivers (with their phone login); which student rides which vehicle; and running costs.
export async function TransportTab({ sp }: { sp: Search }) {
  const t = SUB.some(([id]) => id === sp.t) ? sp.t! : "live";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {SUB.map(([id, l]) => <Link key={id} href={`/principal/care?tab=transport&t=${id}`} className={`pill ${id === t ? "pill-blue" : "pill-gray"}`} style={{ minHeight: 36, paddingInline: 14 }}>{l}</Link>)}
        <Link href="/principal/reports?cat=transport" className="pill pill-gray ml-auto" style={{ minHeight: 36, paddingInline: 14 }}>Transport reports</Link>
      </div>
      {t === "live" && <Live />}
      {t === "routes" && <Routes routeId={sp.route} />}
      {t === "vehicles" && <Vehicles vanId={sp.van} login={sp.login} />}
      {t === "riders" && <Riders vanId={sp.van} />}
      {t === "costs" && <Costs />}
    </>
  );
}

async function Live() {
  const sb = await createClient();
  const today = todayPK();
  const [{ data: vans }, { data: trips }, { data: sos }, { data: riders }] = await Promise.all([
    sb.from("vans").select("id, name, plate, driver_name, driver_phone, seats, profiles:driver_profile_id(full_name, phone), transport_routes(name)").eq("active", true).order("name"),
    sb.from("van_trips").select("id, van_id, leg, status, started_at, ended_at, last_lat, last_lng, last_seen_at, missing").eq("date", today),
    sb.from("transport_sos").select("id, van_id, lat, lng, note, status, created_at, acked_at, profiles:driver_id(full_name, phone)").neq("status", "closed").order("created_at", { ascending: false }),
    sb.from("van_students").select("van_id, student_id, students(full_name, status)"),
  ]);
  const ids = (trips ?? []).map((x) => x.id);
  const { data: events } = ids.length ? await sb.from("trip_events").select("trip_id, student_id, kind, at").in("trip_id", ids).order("at") : { data: [] };
  type V = { id: string; name: string; plate: string | null; driver_name: string | null; driver_phone: string | null; seats: number | null; profiles: { full_name: string; phone: string | null } | null; transport_routes: { name: string } | null };
  type S = { id: string; van_id: string; lat: number | null; lng: number | null; note: string | null; status: string; created_at: string; acked_at: string | null; profiles: { full_name: string; phone: string | null } | null };
  const V = (vans ?? []) as unknown as V[];
  const vanName = new Map(V.map((v) => [v.id, v.name]));
  return (
    <>
      <div className="flex justify-end"><LiveRefresh tables={["transport_sos", "van_trips", "trip_events"]} /></div>
      {((sos ?? []) as unknown as S[]).map((s) => (
        <section key={s.id} className="card flex flex-col gap-2" style={{ borderColor: "var(--red)", background: s.status === "open" ? "#fef2f2" : undefined }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill pill-red">SOS {s.status === "open" ? "· not answered" : "· answered"}</span>
            <b>{vanName.get(s.van_id) ?? "Vehicle"}</b><span className="muted">{hhmm(s.created_at)} ({ago(s.created_at)}) · {s.profiles?.full_name ?? "Driver"}</span>
          </div>
          {s.lat != null && s.lng != null && <iframe title="Where the SOS was sent from" src={mapSrc(s.lat, s.lng)} className="h-56 w-full rounded-xl border-2 border-[#e5e7eb]" loading="lazy" />}
          <div className="flex flex-wrap gap-2">
            {s.profiles?.phone && <a href={`tel:${s.profiles.phone}`} className="btn">Call driver</a>}
            {s.lat != null && s.lng != null && <a href={mapLink(s.lat, s.lng)} target="_blank" rel="noreferrer" className="btn-ghost">Open in Google Maps</a>}
            <form action={answerSos}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value={s.status === "open" ? "answered" : "closed"} /><button className="btn-ghost" type="submit">{s.status === "open" ? "I am handling it" : "Close: all safe"}</button></form>
          </div>
        </section>
      ))}
      {V.length === 0 && <Empty>No vehicles yet. Add one on “Vehicles & drivers”.</Empty>}
      <div className="grid gap-4 xl:grid-cols-2">
        {V.map((v) => {
          const kids = (riders ?? []).filter((r) => r.van_id === v.id && (r.students as unknown as { status: string } | null)?.status === "enrolled");
          const ts = (trips ?? []).filter((x) => x.van_id === v.id).sort((a, b) => a.leg.localeCompare(b.leg));
          const open = ts.find((x) => x.status === "open");
          const cur = open ?? ts[ts.length - 1];
          const ev = (events ?? []).filter((e) => e.trip_id === cur?.id);
          const last = new Map<string, { kind: string; at: string }>();
          for (const e of ev) { if (e.kind === "undo") last.delete(e.student_id); else last.set(e.student_id, e); }
          const c = (k: string) => [...last.values()].filter((x) => x.kind === k).length;
          const driver = v.profiles?.full_name ?? v.driver_name, phone = v.profiles?.phone ?? v.driver_phone;
          return (
            <section key={v.id} className="card flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h2 className="h2">{v.name}{v.plate ? ` · ${v.plate}` : ""}</h2><p className="muted text-sm">{v.transport_routes?.name ?? "No route"} · {driver ?? "No driver"} · {kids.length}{v.seats ? `/${v.seats}` : ""} children</p></div>
                <span className={`pill ${open ? "pill-green" : "pill-gray"}`}>{open ? `${open.leg} trip on the road` : cur ? `${cur.leg} trip ended ${hhmm(cur.ended_at)}` : "No trip yet today"}</span>
              </div>
              {cur && <div className="grid grid-cols-3 gap-2 text-center">
                {[["On board", c("boarded")], ["Dropped", c("dropped")], ["Absent", c("absent") + (cur.missing?.length ?? 0)]].map(([l, n]) => <div key={l as string} className="rounded-xl border-2 border-[#e5e7eb] p-2"><div className="text-[20px] font-black tabular-nums">{n}</div><div className="muted text-[11px] font-black uppercase">{l}</div></div>)}
              </div>}
              {open && open.last_lat != null && open.last_lng != null ? (
                <>
                  <iframe title={`${v.name} location`} src={mapSrc(open.last_lat, open.last_lng)} className="h-52 w-full rounded-xl border-2 border-[#e5e7eb]" loading="lazy" />
                  <p className="muted text-xs">Last location {ago(open.last_seen_at)}. <a className="underline" href={mapLink(open.last_lat, open.last_lng)} target="_blank" rel="noreferrer">Open in Google Maps</a></p>
                </>
              ) : open ? <p className="muted text-sm">Trip started {hhmm(open.started_at)}; no location yet (the driver&apos;s phone must keep the trip board open).</p> : null}
              {c("boarded") > 0 && cur?.status === "closed" && <div className="notice-warn">{c("boarded")} child{c("boarded") === 1 ? "" : "ren"} picked up with no drop recorded. Call the driver.</div>}
              <div className="flex flex-wrap gap-2">{phone && <a href={`tel:${phone}`} className="btn-ghost" style={{ minHeight: 36 }}>Call driver</a>}<Link href={`/principal/reports?r=trip-log&van=${v.id}`} className="btn-ghost" style={{ minHeight: 36 }}>Trip log</Link></div>
            </section>
          );
        })}
      </div>
    </>
  );
}

async function Routes({ routeId }: { routeId?: string }) {
  const sb = await createClient();
  const [{ data: routes }, { data: stops }] = await Promise.all([
    sb.from("transport_routes").select("*").order("name"),
    sb.from("transport_stops").select("*").order("sort").order("name"),
  ]);
  const route = routeId === "new" ? undefined : (routes ?? []).find((r) => r.id === routeId) ?? (routes ?? [])[0];
  const mine = (stops ?? []).filter((s) => s.route_id === route?.id);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(routes ?? []).map((r) => <Link key={r.id} href={`/principal/care?tab=transport&t=routes&route=${r.id}`} className={`pill ${r.id === route?.id ? "pill-blue" : "pill-gray"}`}>{r.name}{r.active ? "" : " (off)"}</Link>)}
        <Link href="/principal/care?tab=transport&t=routes&route=new" className="pill pill-gray">+ New route</Link>
      </div>
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <form action={saveRoute} className="card">
          <input type="hidden" name="id" value={route?.id ?? ""} />
          <h2 className="h2">{route ? `Edit ${route.name}` : "Add a route"}</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Route name<input className="input" name="name" required defaultValue={route?.name ?? ""} placeholder="Route 1: Model Town" /></label>
            <label className="field">Fee / month (Rs)<input className="input" type="number" min={0} name="fee" defaultValue={route ? route.monthly_fee_paisa / 100 : ""} /></label>
          </div>
          <label className="field">Note<input className="input" name="note" defaultValue={route?.note ?? ""} /></label>
          {route && <label className="field">Status<select className="input" name="active" defaultValue={route.active ? "" : "off"}><option value="">In use</option><option value="off">Not in use</option></select></label>}
          <button className="btn self-start" type="submit">Save route</button>
        </form>
        {route && (
          <section className="card flex flex-col gap-2">
            <h2 className="h2">Stops on {route.name}</h2>
            {mine.length === 0 && <p className="muted">No stops yet. Add them in the order the van reaches them.</p>}
            {mine.map((s) => (
              <form key={s.id} action={deleteStop} className="flex flex-wrap items-center gap-2 border-t-2 border-[#f1f5f9] py-2 first:border-0">
                <input type="hidden" name="id" value={s.id} /><input type="hidden" name="route_id" value={route.id} />
                <span className="tagx b">{s.sort}</span><span className="min-w-0 flex-1 font-black">{s.name}<span className="muted block text-xs font-bold">pick {s.pickup_time?.slice(0, 5) ?? "—"} · drop {s.drop_time?.slice(0, 5) ?? "—"}{s.lat != null ? ` · ${s.lat.toFixed(4)}, ${s.lng?.toFixed(4)}` : ""}</span></span>
                <button className="btn-ghost" style={{ minHeight: 34 }} type="submit">Remove</button>
              </form>
            ))}
            <form action={addStop} className="flex flex-col gap-2 border-t-2 border-[#e5e7eb] pt-3">
              <input type="hidden" name="route_id" value={route.id} />
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <label className="field col-span-2">Stop<input className="input" name="name" required placeholder="Faisal Town, Block A" /></label>
                <label className="field">Order<input className="input" type="number" name="sort" defaultValue={mine.length + 1} /></label>
                <label className="field">Pick-up<input className="input" type="time" name="pickup_time" /></label>
                <label className="field">Drop<input className="input" type="time" name="drop_time" /></label>
                <label className="field">Latitude<input className="input" name="lat" inputMode="decimal" placeholder="31.47" /></label>
                <label className="field">Longitude<input className="input" name="lng" inputMode="decimal" placeholder="74.27" /></label>
              </div>
              <p className="muted text-xs">Location is optional: in Google Maps, press and hold the stop and copy the two numbers. Parents then see their stop on the map.</p>
              <button className="btn-ghost self-start" type="submit">Add stop</button>
            </form>
          </section>
        )}
      </div>
    </>
  );
}

async function Vehicles({ vanId, login }: { vanId?: string; login?: string }) {
  const sb = await createClient();
  const [{ data: vans }, { data: routes }, { data: drivers }] = await Promise.all([
    sb.from("vans").select("*").order("name"),
    sb.from("transport_routes").select("id, name").eq("active", true).order("name"),
    sb.from("profiles").select("id, full_name, phone, user_id").eq("role", "driver").eq("is_active", true).order("full_name"),
  ]);
  const van = vanId === "new" ? undefined : (vans ?? []).find((v) => v.id === vanId) ?? (vans ?? [])[0];
  const today = todayPK();
  const soon = (d: string | null) => d && d <= new Date(Date.parse(today) + 30 * 86400000).toISOString().slice(0, 10);
  return (
    <>
      {login && <div className="notice-ok">Driver can now sign in on their phone: open the school app, type the mobile number <b>{login}</b> in the email box, and the password you set. Then “Install app on phone”.</div>}
      <div className="flex flex-wrap gap-2">
        {(vans ?? []).map((v) => <Link key={v.id} href={`/principal/care?tab=transport&t=vehicles&van=${v.id}`} className={`pill ${v.id === van?.id ? "pill-blue" : "pill-gray"}`}>{v.name}{soon(v.fitness_expires_on) || soon(v.insurance_expires_on) || soon(v.route_permit_expires_on) ? " ⚠" : ""}</Link>)}
        <Link href="/principal/care?tab=transport&t=vehicles&van=new" className="pill pill-gray">+ New vehicle</Link>
      </div>
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <form action={saveVehicle} className="card">
          <input type="hidden" name="id" value={van?.id ?? ""} />
          <h2 className="h2">{van ? `Edit ${van.name}` : "Add a vehicle"}</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Name<input className="input" name="name" required defaultValue={van?.name ?? ""} placeholder="Van 1" /></label>
            <label className="field">Number plate<input className="input" name="plate" defaultValue={van?.plate ?? ""} /></label>
            <label className="field">Seats<input className="input" type="number" name="seats" defaultValue={van?.seats ?? ""} /></label>
            <label className="field">Fee / month (Rs)<input className="input" type="number" name="fee" defaultValue={van ? van.monthly_fee_paisa / 100 : ""} /></label>
            <label className="field">Route<select className="input" name="route_id" defaultValue={van?.route_id ?? ""}><option value="">No route</option>{(routes ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label className="field">Driver (login)<select className="input" name="driver_profile_id" defaultValue={van?.driver_profile_id ?? ""}><option value="">Not chosen</option>{(drivers ?? []).map((d) => <option key={d.id} value={d.id}>{d.full_name}{d.user_id ? "" : " (no login)"}</option>)}</select></label>
            <label className="field">Helper / attendant<input className="input" name="attendant_name" defaultValue={van?.attendant_name ?? ""} /></label>
            <label className="field">Helper&apos;s mobile<input className="input" name="attendant_phone" inputMode="tel" defaultValue={van?.attendant_phone ?? ""} /></label>
            <label className="field">Fitness valid till<input className="input" type="date" name="fitness_expires_on" defaultValue={van?.fitness_expires_on ?? ""} /></label>
            <label className="field">Insurance valid till<input className="input" type="date" name="insurance_expires_on" defaultValue={van?.insurance_expires_on ?? ""} /></label>
            <label className="field">Route permit valid till<input className="input" type="date" name="route_permit_expires_on" defaultValue={van?.route_permit_expires_on ?? ""} /></label>
          </div>
          {van?.driver_name && !van.driver_profile_id && <p className="muted text-sm">Old driver note: {van.driver_name} {van.driver_phone ?? ""}. Add them as a driver on the right to give them the trip board.</p>}
          <button className="btn self-start" type="submit">Save vehicle</button>
        </form>
        <div className="flex flex-col gap-5">
          <section className="card flex flex-col gap-2">
            <h2 className="h2">Drivers</h2>
            {(drivers ?? []).length === 0 && <p className="muted">No drivers yet.</p>}
            {(drivers ?? []).map((d) => (
              <form key={d.id} action={setDriverLogin} className="flex flex-wrap items-end gap-2 border-t-2 border-[#f1f5f9] py-2 first:border-0">
                <input type="hidden" name="profile_id" value={d.id} /><input type="hidden" name="phone" value={d.phone ?? ""} />
                <div className="min-w-0 flex-1"><div className="font-black">{d.full_name}</div><div className="muted text-xs">{d.phone ?? "no mobile"} · {d.user_id ? "can sign in" : "no login yet"}</div></div>
                <input className="input w-40" type="text" name="password" minLength={8} required placeholder={d.user_id ? "New password" : "Password"} aria-label={`Password for ${d.full_name}`} />
                <button className="btn-ghost" style={{ minHeight: 40 }} type="submit">{d.user_id ? "Reset" : "Give login"}</button>
              </form>
            ))}
          </section>
          <form action={addDriver} className="card">
            <h2 className="h2">Add a driver</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">Name<input className="input" name="full_name" required /></label>
              <label className="field">Mobile<input className="input" name="phone" required inputMode="tel" placeholder="03001234567" /></label>
            </div>
            <label className="field">Password for the app (8+ letters)<input className="input" type="text" name="password" minLength={8} /></label>
            <p className="muted text-xs">The driver signs in with this mobile number and password, and sees only their own van&apos;s trip board.</p>
            <button className="btn self-start" type="submit">Add driver</button>
          </form>
        </div>
      </div>
    </>
  );
}

async function Riders({ vanId }: { vanId?: string }) {
  const sb = await createClient();
  const [{ data: vans }, { data: vs }, { data: kids }, { data: stops }] = await Promise.all([
    sb.from("vans").select("id, name, seats, route_id, monthly_fee_paisa, transport_routes(name, monthly_fee_paisa)").order("name"),
    sb.from("van_students").select("van_id, student_id, stop, stop_id, legs"),
    sb.from("students").select("id, full_name, admission_no, sections(name, classes(name))").eq("status", "enrolled").order("full_name").limit(5000),
    sb.from("transport_stops").select("id, route_id, name, sort").order("sort"),
  ]);
  type St = { id: string; full_name: string; admission_no: string | null; sections: { name: string; classes: { name: string } } | null };
  const K = (kids ?? []) as unknown as St[];
  const label = (k: St) => `${k.full_name} · ${k.sections ? `${k.sections.classes.name}-${k.sections.name}` : "no class"}${k.admission_no ? ` · ${k.admission_no}` : ""}`;
  const byId = new Map(K.map((k) => [k.id, k]));
  type Vn = { id: string; name: string; seats: number | null; route_id: string | null; monthly_fee_paisa: number; transport_routes: { name: string; monthly_fee_paisa: number } | null };
  const V = (vans ?? []) as unknown as Vn[];
  const van = V.find((v) => v.id === vanId) ?? V[0];
  if (!van) return <Empty>Add a vehicle first.</Empty>;
  const riders = (vs ?? []).filter((x) => x.van_id === van.id && byId.has(x.student_id));
  const myStops = (stops ?? []).filter((s) => s.route_id === van.route_id);
  const stopName = new Map((stops ?? []).map((s) => [s.id, s.name]));
  const onAny = new Set((vs ?? []).map((x) => x.student_id));
  const fee = van.transport_routes?.monthly_fee_paisa || van.monthly_fee_paisa;
  return (
    <>
      <div className="flex flex-wrap gap-2">{V.map((v) => <Link key={v.id} href={`/principal/care?tab=transport&t=riders&van=${v.id}`} className={`pill ${v.id === van.id ? "pill-blue" : "pill-gray"}`}>{v.name} ({(vs ?? []).filter((x) => x.van_id === v.id && byId.has(x.student_id)).length})</Link>)}</div>
      <div className="grid gap-5 xl:grid-cols-[2fr_3fr] xl:items-start">
        <form action={assignRider} className="card">
          <h2 className="h2">Add a student to {van.name}</h2>
          <input type="hidden" name="van_id" value={van.id} />
          <label className="field">Student<select className="input" name="student_id" required defaultValue=""><option value="">Choose student</option>{K.filter((k) => !onAny.has(k.id)).map((k) => <option key={k.id} value={k.id}>{label(k)}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">Stop<select className="input" name="stop_id" defaultValue=""><option value="">{myStops.length ? "Choose stop" : "No stops on this route"}</option>{myStops.map((s) => <option key={s.id} value={s.id}>{s.sort}. {s.name}</option>)}</select></label>
            <label className="field">Trips<select className="input" name="legs" defaultValue="both"><option value="both">Both ways</option><option value="pick">Morning only</option><option value="drop">Afternoon only</option></select></label>
          </div>
          <p className="muted text-xs">Van fee {fee ? rupees(fee) : "not set"} / month. Add it to the family&apos;s fee plan on the Fees screen.</p>
          <button className="btn self-start" type="submit">Add</button>
        </form>
        <section className="card flex flex-col gap-1">
          <h2 className="h2">{van.name} · {riders.length}{van.seats ? `/${van.seats}` : ""} children{van.transport_routes ? ` · ${van.transport_routes.name}` : ""}</h2>
          {riders.length === 0 && <p className="muted">No children on this vehicle yet.</p>}
          {riders.map((r) => (
            <form key={r.student_id} action={assignRider} className="flex flex-wrap items-center gap-2 border-t-2 border-[#f1f5f9] py-2 first:border-0">
              <input type="hidden" name="student_id" value={r.student_id} /><input type="hidden" name="back_van" value={van.id} />
              <span className="min-w-0 flex-1 font-extrabold">{label(byId.get(r.student_id)!)}<span className="muted block text-xs">{(r.stop_id && stopName.get(r.stop_id)) || r.stop || "no stop"} · {r.legs === "both" ? "both ways" : r.legs === "pick" ? "morning only" : "afternoon only"}</span></span>
              <button className="btn-ghost" style={{ minHeight: 34 }} type="submit">Remove</button>
            </form>
          ))}
        </section>
      </div>
    </>
  );
}

async function Costs() {
  const sb = await createClient();
  const today = todayPK();
  const from = today.slice(0, 8) + "01";
  const [{ data: vans }, { data: costs }] = await Promise.all([
    sb.from("vans").select("id, name").order("name"),
    sb.from("vehicle_costs").select("id, van_id, spent_on, kind, amount_paisa, liters, odometer, note").gte("spent_on", from).order("spent_on", { ascending: false }),
  ]);
  const name = new Map((vans ?? []).map((v) => [v.id, v.name]));
  const total = (costs ?? []).reduce((t, c) => t + Number(c.amount_paisa), 0);
  return (
    <div className="grid gap-5 xl:grid-cols-[2fr_3fr] xl:items-start">
      <form action={addVehicleCost} className="card">
        <h2 className="h2">Add a running cost</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">Vehicle<select className="input" name="van_id" required>{(vans ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
          <label className="field">Kind<select className="input" name="kind" defaultValue="fuel">{Object.entries(COST).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field">Amount (Rs)<input className="input" type="number" min={1} name="amount" required /></label>
          <label className="field">Date<input className="input" type="date" name="spent_on" defaultValue={today} /></label>
          <label className="field">Litres (fuel)<input className="input" type="number" step="0.1" name="liters" /></label>
          <label className="field">Odometer (km)<input className="input" type="number" name="odometer" /></label>
          <label className="field">Paid to<input className="input" name="paid_to" placeholder="PSO pump, mechanic…" /></label>
          <label className="field">Paid by<select className="input" name="mode" defaultValue="cash"><option value="cash">Cash</option><option value="jazzcash">JazzCash</option><option value="easypaisa">Easypaisa</option></select></label>
        </div>
        <label className="field">Note<input className="input" name="note" /></label>
        <p className="muted text-xs">Saved under Expenses → Transport too, so it shows in the day close and in Income and costs.</p>
        <button className="btn self-start" type="submit">Add cost</button>
      </form>
      <section className="card flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">This month · {rupees(total)}</h2><Link href="/principal/reports?r=transport-cost-summary" className="btn-ghost" style={{ minHeight: 36 }}>Profit by vehicle</Link></div>
        {(costs ?? []).length === 0 && <p className="muted">Nothing entered this month.</p>}
        {(costs ?? []).map((c) => (
          <div key={c.id} className="flex flex-wrap justify-between gap-2 border-t-2 border-[#f1f5f9] py-2 text-sm font-bold first:border-0">
            <span>{c.spent_on} · {name.get(c.van_id)} · {COST[c.kind] ?? c.kind}{c.liters ? ` · ${c.liters} L` : ""}{c.odometer ? ` · ${c.odometer} km` : ""}{c.note ? ` · ${c.note}` : ""}</span>
            <span className="tabular-nums">{rupees(Number(c.amount_paisa))}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
