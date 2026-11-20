"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { alertFamily, alertSos } from "./actions";

type Stu = { id: string; gr: string | null; name: string; class: string | null; stop: string | null; stop_sort: number; pickup: string | null; drop: string | null; legs: string; phone: string | null; photo: string | null; on_leave: boolean };
type Trip = { id: string; leg: string; status: string; started_at: string | null; ended_at: string | null };
type Ev = { trip_id?: string; student_id: string; kind: string; at: string };
type Van = { id: string; name: string; plate: string | null; seats: number | null; route: string | null; trips: Trip[]; students: Stu[]; events: Ev[] };
export type Board = { date: string; vans: Van[] };
type Mark = { id: string; van: string; leg: string; student: string; kind: string; at: string };
type Op = { id: string; fn: "trip_start" | "trip_end" | "trip_mark" | "trip_sos"; args: Record<string, unknown>; alert?: { van: string; vanName: string; student: string; name: string; kind: string } | { sos: true; vanName: string } };

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" });
const KIND: Record<string, [string, string]> = { boarded: ["On board", "pill-blue"], dropped: ["Dropped", "pill-green"], absent: ["Absent", "pill-gray"] };

export function DriverBoard({ initial, driverId }: { initial: Board; driverId: string }) {
  const supabase = useMemo(() => createClient(), []);
  // the last board seen online is kept, so the page still works with no signal
  const [board, setBoard] = useState<Board>(initial);
  const date = board.date;
  const K = { board: `ilm-drv-board-${driverId}`, marks: `ilm-drv-marks-${driverId}-${date}`, trips: `ilm-drv-trips-${driverId}-${date}`, queue: `ilm-drv-queue-${driverId}` };
  const [vanId, setVanId] = useState(initial.vans[0]?.id ?? "");
  const [leg, setLeg] = useState(() => Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi", hour: "numeric", hour12: false })) < 11 ? "morning" : "afternoon");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [tripState, setTripState] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<Op[]>([]);
  const [online, setOnline] = useState(true);
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number; at: number } | null>(null);
  const [gpsError, setGpsError] = useState("");
  const [sosArmed, setSosArmed] = useState(false);
  const [msg, setMsg] = useState("");
  const [scan, setScan] = useState(false);
  const flushing = useRef(false);
  const lastPing = useRef(0);

  // start from what is on the phone
  useEffect(() => {
    const saved = load<Board | null>(K.board, null);
    if (initial.vans.length) save(K.board, initial);
    else if (saved && saved.date === initial.date) setBoard(saved);
    setMarks(load(K.marks, []));
    setTripState(load(K.trips, {}));
    setQueue(load(K.queue, []));
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const van = board.vans.find((v) => v.id === vanId) ?? board.vans[0];
  const key = `${van?.id}:${leg}`;
  const serverTrip = van?.trips.find((t) => t.leg === leg);
  const tripOpen = (tripState[key] ?? serverTrip?.status) === "open";
  const anyOpen = board.vans.some((v) => ["morning", "afternoon"].some((l) => (tripState[`${v.id}:${l}`] ?? v.trips.find((t) => t.leg === l)?.status) === "open"));

  // each child's latest mark on this trip: the server's, then any made on this phone since
  const status = useMemo(() => {
    const m = new Map<string, { kind: string; at: string }>();
    if (!van) return m;
    const legOf = new Map(van.trips.map((t) => [t.id, t.leg]));
    const all = [...van.events.filter((e) => legOf.get(e.trip_id ?? "") === leg).map((e) => ({ student: e.student_id, kind: e.kind, at: e.at })),
      ...marks.filter((x) => x.van === van.id && x.leg === leg)].sort((a, b) => a.at.localeCompare(b.at));
    for (const e of all) { if (e.kind === "undo") m.delete(e.student); else m.set(e.student, { kind: e.kind, at: e.at }); }
    return m;
  }, [van, marks, leg]);

  const enqueue = useCallback((op: Op) => {
    setQueue((q) => { const n = [...q, op]; save(K.queue, n); return n; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // send waiting marks, in order, whenever there is a signal
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let q = load<Op[]>(K.queue, []);
      while (q.length) {
        const op = q[0];
        const { data, error } = await supabase.rpc(op.fn, op.args);
        if (error && /fetch|network|Failed|timeout/i.test(error.message)) break; // still offline: try later
        if (error) setMsg(`Not saved: ${error.message}`);
        else if (op.alert && "sos" in op.alert) alertSos(String(data), op.alert.vanName).catch(() => {});
        else if (op.alert) alertFamily(op.alert.van, op.alert.vanName, op.alert.student, op.alert.name, op.alert.kind).catch(() => {});
        q = q.slice(1); save(K.queue, q); setQueue(q);
      }
    } catch { /* offline */ } finally { flushing.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => { if (online && queue.length) flush(); }, [online, queue.length, flush]);
  useEffect(() => { const t = setInterval(() => { if (navigator.onLine) flush(); }, 15000); return () => clearInterval(t); }, [flush]);

  // location: only while a trip is open, and only from this open screen
  useEffect(() => {
    if (!anyOpen || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition((p) => {
      const g = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
      setGps(g); setGpsError("");
      if (Date.now() - lastPing.current < 20000 || !navigator.onLine) return;
      lastPing.current = Date.now();
      for (const v of board.vans) for (const l of ["morning", "afternoon"]) {
        if ((tripState[`${v.id}:${l}`] ?? v.trips.find((t) => t.leg === l)?.status) !== "open") continue;
        supabase.rpc("trip_ping", { p_van: v.id, p_date: date, p_leg: l, p_lat: g.lat, p_lng: g.lng, p_accuracy: g.acc, p_speed: p.coords.speed }).then(() => {}, () => {});
      }
    }, (e) => setGpsError(e.code === 1 ? "Location is blocked. Allow location for this site so parents can see the van." : "Looking for GPS signal…"), { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    // keep the screen on during the trip, where the phone allows it
    let lock: { release: () => Promise<void> } | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    wl?.request("screen").then((l) => { lock = l; }, () => {});
    return () => { navigator.geolocation.clearWatch(id); lock?.release().catch(() => {}); };
  }, [anyOpen, board.vans, tripState, supabase, date]);

  function setTrip(state: "open" | "closed") {
    if (!van) return;
    const n = { ...tripState, [key]: state };
    setTripState(n); save(K.trips, n);
    enqueue(state === "open"
      ? { id: uuid(), fn: "trip_start", args: { p_van: van.id, p_leg: leg, p_date: date } }
      : { id: uuid(), fn: "trip_end", args: { p_van: van.id, p_date: date, p_leg: leg } });
    setMsg(state === "open" ? `${leg === "morning" ? "Morning" : "Afternoon"} trip started.` : "Trip ended. Location sharing stopped.");
  }

  function mark(s: Stu, kind: string, method = "driver") {
    if (!van) return;
    if (!tripOpen && kind !== "undo") setTrip("open");
    const m: Mark = { id: uuid(), van: van.id, leg, student: s.id, kind, at: new Date().toISOString() };
    setMarks((x) => { const n = [...x, m]; save(K.marks, n); return n; });
    enqueue({ id: m.id, fn: "trip_mark", args: { p_van: van.id, p_date: date, p_leg: leg, p_student: s.id, p_kind: kind, p_client: m.id, p_at: m.at, p_lat: gps?.lat ?? null, p_lng: gps?.lng ?? null, p_method: method },
      alert: kind === "undo" ? undefined : { van: van.id, vanName: van.name, student: s.id, name: s.name.split(" ")[0], kind } });
    if ("vibrate" in navigator) navigator.vibrate(60);
  }

  function sos() {
    if (!van) return;
    if (!sosArmed) { setSosArmed(true); setTimeout(() => setSosArmed(false), 5000); return; }
    setSosArmed(false);
    const id = uuid();
    enqueue({ id, fn: "trip_sos", args: { p_van: van.id, p_lat: gps?.lat ?? null, p_lng: gps?.lng ?? null, p_note: `SOS from ${van.name}`, p_client: id }, alert: { sos: true, vanName: van.name } });
    setMsg(navigator.onLine ? "SOS sent to the principal. Help is coming. Call 1122 if anyone is hurt." : "No signal: SOS will send the moment the phone finds a signal. Call 1122 or the school now.");
    if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
  }

  if (!van) return <div className="card"><p className="font-bold">No vehicle is given to you yet. Ask the principal to choose you as the driver of a van in Transport.</p></div>;

  const riders = van.students.filter((s) => s.legs === "both" || (leg === "morning" ? s.legs === "pick" : s.legs === "drop"));
  const count = (k: string) => riders.filter((s) => status.get(s.id)?.kind === k).length;
  const waiting = riders.filter((s) => !status.has(s.id) && !s.on_leave).length;
  const stops = [...new Map(riders.map((s) => [s.stop ?? "No stop", s.stop_sort])).entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);
  const next = (s: Stu) => !status.has(s.id) ? "boarded" : status.get(s.id)!.kind === "boarded" ? "dropped" : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill ${online ? "pill-green" : "pill-orange"}`}>{online ? "Online" : "No signal: marks are saved on the phone"}</span>
        {queue.length > 0 && <span className="pill pill-orange">{queue.length} waiting to send</span>}
        {tripOpen && <span className={`pill ${gps ? "pill-blue" : "pill-gray"}`}>{gps ? `Location shared · ${Math.round(gps.acc)} m` : "Finding location…"}</span>}
      </div>
      {gpsError && tripOpen && <div className="notice-warn">{gpsError}</div>}
      {msg && <div className="notice-ok" role="status">{msg}</div>}

      {board.vans.length > 1 && (
        <div className="flex flex-wrap gap-2">{board.vans.map((v) => <button key={v.id} type="button" onClick={() => setVanId(v.id)} className={`pill ${v.id === van.id ? "pill-blue" : "pill-gray"}`} style={{ minHeight: 40, paddingInline: 14 }}>{v.name}</button>)}</div>
      )}
      <section className="card flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="h2">{van.name}{van.plate ? ` · ${van.plate}` : ""}</h2><p className="muted text-sm">{van.route ?? "No route set"} · {riders.length} children</p></div>
          <div className="flex gap-1" role="radiogroup" aria-label="Trip">
            {[["morning", "Morning"], ["afternoon", "Afternoon"]].map(([v, l]) => (
              <label key={v} className="seg p"><input type="radio" name="leg" checked={leg === v} onChange={() => setLeg(v)} /><span className="px-3">{l}</span></label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[["Waiting", waiting], ["On board", count("boarded")], ["Dropped", count("dropped")], ["Absent", count("absent")]].map(([l, n]) => (
            <div key={l as string} className="rounded-xl border-2 border-[#e5e7eb] p-2"><div className="text-[22px] font-black tabular-nums">{n}</div><div className="muted text-[11px] font-black uppercase">{l}</div></div>
          ))}
        </div>
        {tripOpen
          ? <button type="button" className="btn-ghost" onClick={() => { if (count("boarded") === 0 || confirm(`${count("boarded")} children are still on board. End the trip anyway?`)) setTrip("closed"); }}>End {leg} trip</button>
          : <button type="button" className="btn" style={{ minHeight: 56, fontSize: 18 }} onClick={() => setTrip("open")}>Start {leg} trip</button>}
        <button type="button" className="btn-ghost" onClick={() => setScan(!scan)}>{scan ? "Stop scanning cards" : "Scan ID cards"}</button>
        {scan && <CardScanner onCode={(code) => {
          const gr = code.split("|")[0].trim().toUpperCase();
          const s = riders.find((x) => (x.gr ?? "").toUpperCase() === gr);
          if (!s) { setMsg(`Card ${gr} is not on ${van.name}.`); return; }
          const k = next(s);
          if (k) { mark(s, k, "scan"); setMsg(`${s.name}: ${KIND[k][0]}`); } else setMsg(`${s.name} is already dropped.`);
        }} />}
      </section>

      {stops.map((stop) => (
        <section key={stop} className="card flex flex-col gap-1">
          <h3 className="kick">{stop}{(() => { const s = riders.find((x) => (x.stop ?? "No stop") === stop); const t = leg === "morning" ? s?.pickup : s?.drop; return t ? ` · ${t}` : ""; })()}</h3>
          {riders.filter((s) => (s.stop ?? "No stop") === stop).map((s) => {
            const st = status.get(s.id), k = next(s);
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2 border-t-2 border-[#f1f5f9] py-2 first:border-0">
                <div className="min-w-0 flex-1">
                  <div className="font-black">{s.name} {s.on_leave && <span className="pill pill-orange">On leave today</span>}</div>
                  <div className="muted text-xs">{s.class ?? ""}{st ? ` · ${KIND[st.kind]?.[0] ?? st.kind} ${hhmm(st.at)}` : ""}</div>
                </div>
                {st && <span className={`pill ${KIND[st.kind]?.[1] ?? "pill-gray"}`}>{KIND[st.kind]?.[0] ?? st.kind}</span>}
                {k && <button type="button" className="btn" style={{ minHeight: 44 }} onClick={() => mark(s, k)}>{k === "boarded" ? (leg === "morning" ? "Picked up" : "On board") : leg === "morning" ? "At school" : "Dropped home"}</button>}
                {!st && <button type="button" className="btn-ghost" style={{ minHeight: 44 }} onClick={() => mark(s, "absent")}>Absent</button>}
                {st && <button type="button" className="btn-ghost" style={{ minHeight: 44 }} onClick={() => mark(s, "undo")} aria-label={`Undo for ${s.name}`}>Undo</button>}
                {s.phone && <a href={`tel:${s.phone}`} className="btn-ghost" style={{ minHeight: 44 }} aria-label={`Call ${s.name}'s parent`}>Call</a>}
              </div>
            );
          })}
        </section>
      ))}
      {riders.length === 0 && <div className="card"><p className="muted">No children on this {leg} trip.</p></div>}

      <section className="card flex flex-col gap-2" style={{ borderColor: "var(--red)" }}>
        <button type="button" onClick={sos} className="rounded-2xl text-[22px] font-black text-white" style={{ minHeight: 72, background: sosArmed ? "#7f1d1d" : "var(--red)", boxShadow: "0 5px 0 #991b1b" }}>
          {sosArmed ? "Tap again to send SOS" : "SOS · Emergency"}
        </button>
        <div className="flex flex-wrap gap-2"><a href="tel:1122" className="btn-ghost">Call 1122 (Rescue)</a><a href="tel:15" className="btn-ghost">Call 15 (Police)</a></div>
        <p className="muted text-xs">SOS tells the principal at once, with where the van is. It works without signal too: it sends the moment the phone connects.</p>
      </section>
    </div>
  );
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

function CardScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  const seen = useRef(new Map<string, number>());
  const cb = useRef(onCode);
  cb.current = onCode;
  useEffect(() => {
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!BD) { setErr("This phone's browser can't read QR codes. Use Chrome on Android, or tap the names below."); return; }
    const det = new BD({ formats: ["qr_code"] });
    let stream: MediaStream | null = null, stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream; await video.current.play();
        while (!stop) {
          try {
            for (const c of await det.detect(video.current)) {
              if (Date.now() - (seen.current.get(c.rawValue) ?? 0) < 8000) continue;
              seen.current.set(c.rawValue, Date.now()); cb.current(c.rawValue);
            }
          } catch { /* next frame */ }
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch { setErr("Camera not allowed."); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return err ? <p className="notice-warn">{err}</p> : <video ref={video} playsInline muted className="aspect-square w-full max-w-xs self-center rounded-2xl bg-black object-cover" />;
}
