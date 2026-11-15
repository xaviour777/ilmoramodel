import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { pct, shortDate, todayPK } from "@/lib/format";
import { LiveRefresh } from "@/components/live-refresh";

const GOAL = 0.9;
const DAY = 86400000;

// Students and staff attendance across the school (design/Attendance.dc.html).
// Teachers mark their own classes; this page reads what they marked.
export default async function PrincipalAttendance() {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const today = todayPK();
  const since = new Date(Date.parse(today) - 20 * DAY).toISOString().slice(0, 10);
  const [sections, byDay, todayRows, staffToday, staffCount, absences] = await Promise.all([
    supabase.from("sections").select("id, name, classes(name, sort)"),
    supabase.from("attendance_by_section_day").select("section_id, date, present, marked").gte("date", since).order("date"),
    supabase.from("attendance").select("status").eq("date", today),
    supabase.from("staff_attendance").select("status").eq("date", today),
    supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", ["principal", "teacher", "accountant"]).eq("is_active", true),
    supabase.from("attendance").select("student_id, date, students(full_name, roll_no, families(phone, reminder_phone), sections(name, classes(name)))").eq("status", "absent").gte("date", since),
  ]);

  type Sec = { id: string; name: string; classes: { name: string; sort: number } };
  const secs = ((sections.data ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const count = (st: string) => (todayRows.data ?? []).filter((r) => r.status === st).length;
  const present = count("present"), absent = count("absent"), late = count("late"), leave = count("leave");
  const marked = present + absent + late + leave;
  const markedSecs = new Set((byDay.data ?? []).filter((d) => d.date === today && d.marked > 0).map((d) => d.section_id));
  const notMarked = secs.filter((s) => !markedSecs.has(s.id));
  const days = [...new Set((byDay.data ?? []).map((d) => d.date as string))].sort().slice(-5);
  const cell = (sec: string, date: string) => (byDay.data ?? []).find((d) => d.section_id === sec && d.date === date);
  const staffMarked = (staffToday.data ?? []).length;
  const staffIn = (staffToday.data ?? []).filter((s) => s.status === "present" || s.status === "late").length;

  type Ab = { student_id: string; students: { full_name: string; roll_no: string | null; families: { phone: string | null; reminder_phone: string | null } | null; sections: { name: string; classes: { name: string } } | null } };
  const tally = new Map<string, { id: string; n: number; name: string; cls: string; phone: string | null }>();
  for (const a of (absences.data ?? []) as unknown as Ab[]) {
    const s = a.students;
    const cur = tally.get(a.student_id) ?? { id: a.student_id, n: 0, name: s.full_name, cls: s.sections ? `${s.sections.classes.name}-${s.sections.name}` : "", phone: s.families?.reminder_phone || s.families?.phone || null };
    cur.n++; tally.set(a.student_id, cur);
  }
  const toCall = [...tally.values()].filter((x) => x.n >= 3).sort((a, b) => b.n - a.n);
  const dname = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kick">Daily</div>
          <h1 className="h1 mt-1">Attendance</h1>
          <p className="muted mt-1.5 text-[15px]">Students and staff, {shortDate(today)}. Teachers mark their own classes from their phones.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <LiveRefresh tables={["attendance", "staff_attendance"]} />
          <Link href="/principal/staff" className="btn">Mark staff</Link>
        </div>
      </div>

      <section className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Stat label="Present" value={present + late} tone="#15803d" sub={marked ? pct((present + late) / marked, 1) : "not marked yet"} />
        <Stat label="Absent" value={absent} tone="#b91c1c" sub={marked ? pct(absent / marked, 1) : "—"} />
        <Stat label="On leave" value={leave} tone="#92400e" sub="approved" />
        <Stat label="Late" value={late} tone="#c2410c" sub="counted present" />
        <Stat label="Not marked" value={notMarked.length} tone={notMarked.length ? "#b91c1c" : "#15803d"} sub={`of ${secs.length} sections`} />
        <Stat label="Staff in" value={staffIn} tone="#0369a1" sub={staffMarked ? `of ${staffCount.count ?? staffMarked} staff` : "not marked yet"} />
      </section>

      <section className="flex flex-wrap items-start gap-5">
        <div className="card min-w-0 flex-[3_1_540px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">Section heatmap</h2>
            <div className="flex flex-wrap gap-2 text-[12px] font-extrabold text-[#4b5563]">
              <Key c="#16a34a" t="95%+" /><Key c="#86efac" t="90-95%" /><Key c="#fcd34d" t="Below 90%" /><Key c="#e5e7eb" t="Not marked" />
            </div>
          </div>
          {days.length === 0 ? <p className="muted mt-3">No attendance marked in the last three weeks.</p> : (
            <div className="mt-3 overflow-x-auto">
              <div className="grid min-w-[420px] gap-1.5" style={{ gridTemplateColumns: `110px repeat(${days.length}, minmax(0, 1fr))` }}>
                <span className="kick">Section</span>
                {days.map((d) => <span key={d} className="kick text-center">{d === today ? "Today" : dname(d)}</span>)}
                {secs.map((s) => (
                  <Row key={s.id} label={`${s.classes.name}-${s.name}`} cells={days.map((d) => { const c = cell(s.id, d); return c && c.marked ? c.present / c.marked : null; })} />
                ))}
              </div>
            </div>
          )}
          {notMarked.length > 0 && markedSecs.size > 0 && <p className="notice-warn mt-3 text-[14px]">Not marked yet today: {notMarked.map((s) => `${s.classes.name}-${s.name}`).join(", ")}</p>}
        </div>

        <div className="card min-w-0 flex-[2_1_320px]">
          <h2 className="h2">Students to call</h2>
          <p className="muted text-[13px]">3 or more absences in the last 3 weeks</p>
          {toCall.length === 0 && <p className="muted mt-3">Nobody right now.</p>}
          {toCall.slice(0, 12).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2.5">
              <div className="min-w-0 flex-1"><div className="truncate font-black">{s.name}</div><div className="muted text-[12px]">{s.cls} · {s.phone ?? "No phone saved"}</div></div>
              <span className="tagx r">{s.n} absences</span>
              {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="btn" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }}>Call</a>}
              <Link href={`/principal/students/${s.id}`} className="btn-ghost" style={{ minHeight: 34, padding: "0 12px", fontSize: 12 }}>File</Link>
            </div>
          ))}
          <h2 className="h2 mt-5">Rules</h2>
          <ul className="muted mt-2 flex list-disc flex-col gap-1 pl-5 text-[14px]">
            <li>Daily goal is {pct(GOAL)} present.</li>
            <li>Late counts as present; leave is excused.</li>
            <li>Parents get an absent message when a teacher marks a child absent.</li>
          </ul>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="kick">{label}</div>
      <div className="mt-1 text-[30px] leading-9 font-black tabular-nums" style={{ color: tone }}>{value.toLocaleString("en-IN")}</div>
      <div className="muted text-[13px]">{sub}</div>
    </div>
  );
}

function Key({ c, t }: { c: string; t: string }) {
  return <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: c }} />{t}</span>;
}

function Row({ label, cells }: { label: string; cells: (number | null)[] }) {
  return (
    <>
      <span className="truncate text-[13px] font-black">{label}</span>
      {cells.map((r, i) => {
        const bg = r == null ? "#e5e7eb" : r >= 0.95 ? "#16a34a" : r >= GOAL ? "#86efac" : "#fcd34d";
        const fg = r == null ? "#6b7280" : r >= 0.95 ? "#fff" : "#1f2937";
        return <span key={i} className="rounded-lg py-1.5 text-center text-[12px] font-black tabular-nums" style={{ background: bg, color: fg }}>{r == null ? "—" : pct(r)}</span>;
      })}
    </>
  );
}
