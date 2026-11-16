import Link from "next/link";
import { requireRole } from "@/lib/me";
import { StaffTabs } from "@/components/staff-tabs";
import { createClient } from "@/lib/supabase/server";
import { pct, rupees, shortDate, time, todayPK } from "@/lib/format";
import { PageHead, Stats, Stat, Chips, Insight, Empty, Bar, Row } from "@/components/ilm";
import { addStaff, assignSubstitute, decideLeave, saveStaffAttendance } from "../actions";

type Search = { saved?: string; error?: string; date?: string; tab?: string; period?: string; from?: string; to?: string };
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const ROLE: Record<string, string> = { principal: "Principal", teacher: "Teacher", accountant: "Accountant" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const tab = sp.tab === "reports" ? "reports" : "staff";
  const day = isDate(sp.date) && sp.date! <= today ? sp.date! : today;
  const monthStart = today.slice(0, 8) + "01";
  const weekday = ((new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;

  // period for the number cards and reports
  const { data: term } = await supabase.from("terms").select("name, starts_on").lte("starts_on", today).gte("ends_on", today).maybeSingle();
  const period = ["week", "month", "term", "custom"].includes(sp.period ?? "") ? sp.period! : "month";
  const weekStart = iso(Date.parse(today) - (weekday - 1) * DAY);
  const from = period === "week" ? weekStart : period === "term" ? term?.starts_on ?? monthStart : period === "custom" && isDate(sp.from) ? sp.from! : monthStart;
  const to = period === "custom" && isDate(sp.to) && sp.to! >= from ? sp.to! : today;
  const rangeLabel = `${shortDate(from)} – ${shortDate(to)}`;

  const [{ data: pending }, { data: away }, { data: staff }, { data: slots }, { data: subs }, { data: marked }, { data: dayAway }, { data: rangeAtt }, { count: covered }, { data: pay }, { data: leaveUsed }] = await Promise.all([
    supabase.from("leave_requests").select("id, profile_id, from_on, to_on, reason, profiles!leave_requests_profile_id_fkey(full_name, role)").eq("status", "pending").order("from_on"),
    supabase.from("leave_requests").select("profile_id, profiles!leave_requests_profile_id_fkey(full_name)").eq("status", "approved").lte("from_on", today).gte("to_on", today),
    supabase.from("profiles").select("id, full_name, role, phone, user_id").in("role", ["principal", "teacher", "accountant"]).eq("is_active", true).order("role").order("full_name"),
    weekday <= 6
      ? supabase.from("timetable_slots").select("id, teacher_id, period_id, periods!inner(name, starts_at, sort, timing_profiles!inner(is_active)), subjects(name), sections(name, classes(name))").eq("weekday", weekday).eq("periods.timing_profiles.is_active", true)
      : Promise.resolve({ data: [] }),
    supabase.from("substitutions").select("timetable_slot_id, substitute_id").eq("date", today),
    supabase.from("staff_attendance").select("profile_id, date, status").gte("date", monthStart).lte("date", day),
    supabase.from("leave_requests").select("profile_id").eq("status", "approved").lte("from_on", day).gte("to_on", day),
    supabase.from("staff_attendance").select("profile_id, date, status").gte("date", from).lte("date", to),
    supabase.from("substitutions").select("id", { count: "exact", head: true }).gte("date", from).lte("date", to).not("substitute_id", "is", null),
    supabase.from("salary_payments").select("net_paisa, status").eq("month", monthStart),
    supabase.from("leave_requests").select("profile_id, from_on, to_on").eq("status", "approved").gte("to_on", today.slice(0, 4) + "-01-01"),
  ]);
  const onDay = new Map((marked ?? []).filter((m) => m.date === day).map((m) => [m.profile_id, m.status as string]));
  const leaveOnDay = new Set((dayAway ?? []).map((a) => a.profile_id));
  const absentDays = new Map<string, number>();
  for (const m of marked ?? []) if (m.status === "absent") absentDays.set(m.profile_id, (absentDays.get(m.profile_id) ?? 0) + 1);
  const leaveDaysUsed = new Map<string, number>();
  for (const l of leaveUsed ?? []) leaveDaysUsed.set(l.profile_id, (leaveDaysUsed.get(l.profile_id) ?? 0) + Math.round((Date.parse(l.to_on) - Date.parse(l.from_on)) / DAY) + 1);

  type Slot = { id: string; teacher_id: string | null; period_id: string; periods: { name: string; starts_at: string; sort: number }; subjects: { name: string }; sections: { name: string; classes: { name: string } } };
  const all = (slots ?? []) as unknown as Slot[];
  const awayIds = new Set((away ?? []).map((a) => a.profile_id));
  const uncovered = all.filter((s) => s.teacher_id && awayIds.has(s.teacher_id)).sort((a, b) => a.periods.sort - b.periods.sort);
  const subFor = new Map((subs ?? []).map((s) => [s.timetable_slot_id, s.substitute_id]));
  const teachers = (staff ?? []).filter((s) => s.role === "teacher");
  const busy = (periodId: string) => new Set(all.filter((s) => s.period_id === periodId).map((s) => s.teacher_id));
  const name = (p: unknown) => (p as { full_name: string } | null)?.full_name ?? "";
  const nameOf = new Map((staff ?? []).map((s) => [s.id, s.full_name]));

  // number cards for the chosen period
  const ra = rangeAtt ?? [];
  const n = (st: string) => ra.filter((r) => r.status === st).length;
  const inCount = n("present") + n("late");
  const payNet = (pay ?? []).reduce((t, p) => t + Number(p.net_paisa), 0);
  const payPaid = (pay ?? []).filter((p) => p.status === "paid").length;
  const periodHref = (p: string) => `/principal/staff?${new URLSearchParams({ ...(tab === "reports" ? { tab } : {}), period: p })}`;

  const coverIdeas = uncovered.filter((s) => !subFor.get(s.id)).map((s) => {
    const taken = busy(s.period_id);
    const free = teachers.filter((t) => !taken.has(t.id) && !awayIds.has(t.id));
    return { s, free };
  });

  return (
    <>
      <PageHead kick="School · Staff" title="Staff, leave and salaries" sub="Track attendance and leave over any period, cover periods, and run monthly salaries.">
        <Link href="/print/payslip/sheet" target="_blank" className="btn-ghost">Salary sheet</Link>
        <Link href="#add" className="btn">Add staff member</Link>
      </PageHead>
      <StaffTabs current={tab} />
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Chips label="Period" current={period} items={[["week", "This week"], ["month", "This month"], ["term", "This term"], ["custom", "Custom"]].map(([id, label]) => ({ id, label, href: periodHref(id) }))} />
        {period === "custom" ? (
          <form className="flex flex-wrap items-end gap-2">
            {tab === "reports" && <input type="hidden" name="tab" value="reports" />}<input type="hidden" name="period" value="custom" />
            <label className="field">From<input className="input" type="date" name="from" defaultValue={from} max={today} /></label>
            <label className="field">To<input className="input" type="date" name="to" defaultValue={to} max={today} /></label>
            <button className="btn-ghost" type="submit">Show</button>
          </form>
        ) : <span className="kick">{rangeLabel}{period === "term" && term ? ` · ${term.name}` : ""}</span>}
      </div>

      <Stats>
        <Stat label="Attendance" value={ra.length ? pct(inCount / ra.length) : "—"} sub={ra.length ? `${inCount} of ${ra.length} staff-days` : "nothing marked in this period"} />
        <Stat label="Leave days" value={n("leave")} sub={`${(pending ?? []).length} request${(pending ?? []).length === 1 ? "" : "s"} waiting`} />
        <Stat label="Late arrivals" value={n("late")} sub={`${n("absent")} absent day${n("absent") === 1 ? "" : "s"}`} tone={n("late") ? "#c2410c" : undefined} />
        <Stat label="Periods covered" value={covered ?? 0} sub="by substitutes" />
        <Stat label="Payroll" value={pay?.length ? rupees(payNet) : "—"} sub={pay?.length ? `${new Date(monthStart + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} · ${payPaid} of ${pay.length} paid` : "sheet not made this month"} href="/principal/staff/salaries" />
      </Stats>

      {tab === "staff" ? (
        <>
          <section className="flex flex-wrap items-start gap-5">
            <div className="card min-w-0 flex-[3_1_420px]">
              <div className="flex items-center justify-between gap-2"><h2 className="h2">Leave requests</h2>{(pending ?? []).length > 0 && <span className="tagx y">{(pending ?? []).length} waiting</span>}</div>
              {(pending ?? []).length === 0 && <div className="mt-2"><Empty>Nothing waiting.</Empty></div>}
              {(pending ?? []).map((l) => (
                <form key={l.id} action={decideLeave}>
                  <Row>
                    <input type="hidden" name="leave_id" value={l.id} />
                    <div className="min-w-40 flex-1">
                      <div className="font-black">{name(l.profiles)}</div>
                      <div className="muted text-[12px]">{shortDate(l.from_on)}{l.to_on !== l.from_on ? ` – ${shortDate(l.to_on)}` : ""}{l.reason ? ` · ${l.reason}` : ""} · {leaveDaysUsed.get(l.profile_id) ?? 0} leave days used this year</div>
                    </div>
                    <button className="btn-ghost" style={{ minHeight: 36, padding: "0 12px", fontSize: 12 }} name="status" value="rejected" type="submit">Decline</button>
                    <button className="btn" style={{ minHeight: 36, padding: "0 12px", fontSize: 12 }} name="status" value="approved" type="submit">Approve</button>
                  </Row>
                </form>
              ))}
            </div>
            <div className="card flex min-w-0 flex-[2_1_340px] flex-col gap-2.5">
              <div className="kick">Cover today&apos;s periods</div>
              {uncovered.length === 0 ? <Empty>{awayIds.size ? "Nobody on leave has a period today." : "No teacher is on leave today."}</Empty> : (
                <Insight title="Cover">
                  {coverIdeas.length === 0 ? `All ${uncovered.length} periods of teachers on leave are covered.`
                    : `${coverIdeas.length} period${coverIdeas.length === 1 ? "" : "s"} still need cover. ${coverIdeas.slice(0, 3).map(({ s, free }) => `${s.periods.name} ${s.sections.classes.name}-${s.sections.name}: ${free.length ? free.slice(0, 2).map((t) => t.full_name).join(" or ") + " free" : "nobody free"}`).join("; ")}.`}
                </Insight>
              )}
              {uncovered.map((s) => {
                const taken = busy(s.period_id);
                const free = teachers.filter((t) => !taken.has(t.id) && !awayIds.has(t.id));
                const current = subFor.get(s.id);
                return (
                  <form key={s.id} action={assignSubstitute}>
                    <Row>
                      <input type="hidden" name="slot_id" value={s.id} /><input type="hidden" name="date" value={today} /><input type="hidden" name="absent_teacher_id" value={s.teacher_id ?? ""} />
                      <b className="w-12 text-[13px] tabular-nums">{time(s.periods.starts_at)}</b>
                      <div className="min-w-28 flex-1">
                        <div className="font-black">{s.sections.classes.name}-{s.sections.name} {s.subjects.name}</div>
                        <div className="muted text-[12px]">{s.periods.name} · {nameOf.get(s.teacher_id!) ?? ""} · {current ? "covered" : "needs cover"}</div>
                      </div>
                      <select className="input w-40" style={{ minHeight: 36 }} name="substitute_id" defaultValue={current ?? ""} aria-label="Substitute teacher">
                        <option value="">Pick a free teacher</option>
                        {free.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                      </select>
                      <button className="btn" style={{ minHeight: 36, padding: "0 12px", fontSize: 12 }} type="submit">Assign</button>
                    </Row>
                  </form>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="flex flex-wrap items-end justify-between gap-2.5">
              <div>
                <h2 className="h2">Mark attendance · {shortDate(day)}</h2>
                <p className="muted text-[13px]">P present · L late · A absent · Lv leave. Approved leave fills in by itself. {onDay.size ? `${onDay.size} of ${(staff ?? []).length} marked.` : "Not marked yet."}</p>
              </div>
              <form className="flex items-end gap-2">
                <input className="input" style={{ minHeight: 38 }} type="date" name="date" defaultValue={day} max={today} aria-label="Day" />
                <button className="btn-ghost" style={{ minHeight: 38, fontSize: 12 }} type="submit">Show day</button>
              </form>
            </div>
            <form action={saveStaffAttendance} className="mt-2 flex flex-col gap-3">
              <input type="hidden" name="date" value={day} />
              <div className="grid gap-x-6 md:grid-cols-2">
                {(staff ?? []).map((s) => {
                  const cur = onDay.get(s.id) ?? (leaveOnDay.has(s.id) ? "leave" : "present");
                  return (
                    <fieldset key={s.id}>
                      <legend className="sr-only">{s.full_name}</legend>
                      <Row>
                        <div className="min-w-32 flex-1">
                          <div className="font-black">{s.full_name}</div>
                          <div className="muted text-[12px]">{ROLE[s.role] ?? s.role}{absentDays.get(s.id) ? ` · absent ${absentDays.get(s.id)} day${absentDays.get(s.id) === 1 ? "" : "s"} this month` : ""}</div>
                        </div>
                        <div className="flex gap-1.5">
                          {([["present", "P", "p"], ["late", "L", "l"], ["absent", "A", "a"], ["leave", "Lv", "v"]] as const).map(([v, l, c]) => (
                            <label key={v} className={`seg ${c}`} title={v}><input type="radio" name={`st:${s.id}`} value={v} defaultChecked={cur === v} /><span>{l}</span></label>
                          ))}
                        </div>
                      </Row>
                    </fieldset>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <span className="muted text-[13px]">{[...onDay.values()].filter((v) => v === "present" || v === "late").length} present · {[...onDay.values()].filter((v) => v === "absent").length} absent · {(staff ?? []).length - onDay.size} not marked</span>
                <button className="btn" type="submit">Save attendance</button>
              </div>
            </form>
          </section>

          <section className="flex flex-wrap items-start gap-5">
            <div className="card min-w-0 flex-[3_1_420px]">
              <h2 className="h2">Staff</h2>
              <p className="muted text-[13px]">Open a name for the full record: CNIC, education, previous schools, bank, salary and advances.</p>
              {(staff ?? []).map((s) => (
                <Row key={s.id}>
                  <span className={`tagx ${s.role === "teacher" ? "b" : s.role === "principal" ? "v" : "y"}`}>{ROLE[s.role] ?? s.role}</span>
                  <Link href={`/principal/staff/${s.id}`} className="flex-1 font-black hover:underline">{s.full_name}</Link>
                  <span className="muted text-[12px]">{s.user_id ? "can log in" : "no login yet"}</span>
                </Row>
              ))}
            </div>
            <form id="add" action={addStaff} className="card flex min-w-0 flex-[2_1_320px] scroll-mt-6 flex-col gap-3">
              <h2 className="h2">Add a staff member</h2>
              <label className="field">Full name<input className="input" name="full_name" required /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field">Role<select className="input" name="role"><option value="teacher">Teacher</option><option value="accountant">Accountant</option></select></label>
                <label className="field">Phone<input className="input" name="phone" inputMode="tel" placeholder="03001234567" /></label>
              </div>
              <label className="field">Email for login<input className="input" name="email" type="email" /></label>
              <button className="btn self-start" type="submit">Add</button>
              <p className="muted text-[13px]">They can sign in once a login is created for this email (see the README).</p>
            </form>
          </section>
        </>
      ) : <Reports staff={staff ?? []} rows={ra} from={from} to={to} rangeLabel={rangeLabel} />}
    </>
  );
}

async function Reports({ staff, rows, from, to, rangeLabel }: { staff: { id: string; full_name: string; role: string }[]; rows: { profile_id: string; date: string; status: string }[]; from: string; to: string; rangeLabel: string }) {
  const supabase = await createClient();
  const { data: subsDone } = await supabase.from("substitutions").select("substitute_id").gte("date", from).lte("date", to).not("substitute_id", "is", null);
  const extra = new Map<string, number>();
  for (const s of subsDone ?? []) extra.set(s.substitute_id!, (extra.get(s.substitute_id!) ?? 0) + 1);
  // chart: by week for long ranges, by day for short ones
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  const bucket = (d: string) => days > 14 ? iso(Date.parse(d) - ((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7) * DAY) : d;
  const buckets = new Map<string, { p: number; l: number; a: number }>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const b = buckets.get(bucket(r.date)) ?? { p: 0, l: 0, a: 0 };
    if (r.status === "present" || r.status === "late") b.p++; else if (r.status === "leave") b.l++; else b.a++;
    buckets.set(bucket(r.date), b);
  }
  const bars = [...buckets.entries()].slice(-12);
  const max = Math.max(1, ...bars.map(([, b]) => b.p + b.l + b.a));
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  const byWeekday = [1, 2, 3, 4, 5, 6].map((w) => ({ w, n: rows.filter((r) => r.status === "absent" && ((new Date(r.date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1 === w).length }));
  const worst = [...byWeekday].sort((a, b) => b.n - a.n)[0];
  const WD = ["", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
  const per = staff.map((s) => {
    const mine = rows.filter((r) => r.profile_id === s.id);
    const c = (st: string) => mine.filter((r) => r.status === st).length;
    return { ...s, present: c("present"), late: c("late"), leave: c("leave"), absent: c("absent"), total: mine.length, extra: extra.get(s.id) ?? 0 };
  }).sort((a, b) => (a.total ? (a.present + a.late) / a.total : 2) - (b.total ? (b.present + b.late) / b.total : 2));
  const mostAway = per.filter((p) => p.absent + p.leave > 0).sort((a, b) => b.absent + b.leave - (a.absent + a.leave))[0];
  const kinds = [["Absent", count("absent"), "#ef4444"], ["Leave", count("leave"), "#f59e0b"], ["Late", count("late"), "#0284c7"]] as const;
  const kindMax = Math.max(1, ...kinds.map((k) => k[1]));

  return (
    <>
      <section className="flex flex-wrap items-start gap-5">
        <div className="card min-w-0 flex-[3_1_480px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">Staff attendance · {rangeLabel}</h2>
            <span className="flex gap-3 text-[12px] font-extrabold text-[#4b5563]">
              {[["#16a34a", "Present"], ["#f59e0b", "Leave"], ["#ef4444", "Absent"]].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: c }} />{l}</span>)}
            </span>
          </div>
          {bars.length === 0 ? <div className="mt-3"><Empty>No staff attendance marked in this period.</Empty></div> : (
            <>
              <div className="mt-4 flex h-[200px] items-end gap-2 border-b-2 border-[#e5e7eb] sm:gap-3.5" role="img"
                aria-label={bars.map(([d, b]) => `${shortDate(d)}: ${b.p} present, ${b.l} leave, ${b.a} absent`).join("; ")}>
                {bars.map(([d, b]) => (
                  <div key={d} className="flex h-full flex-1 flex-col justify-end" title={`${b.p} present · ${b.l} leave · ${b.a} absent`}>
                    <div className="mx-auto flex w-full max-w-[56px] flex-col overflow-hidden rounded-t-[10px] rounded-b-[4px]" style={{ height: `${((b.p + b.l + b.a) / max) * 100}%` }}>
                      <div style={{ flex: b.a, background: "#ef4444" }} /><div style={{ flex: b.l, background: "#f59e0b" }} /><div style={{ flex: b.p, background: "#16a34a" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-2 sm:gap-3.5">{bars.map(([d]) => <span key={d} className="kick flex-1 text-center" style={{ fontSize: 10 }}>{days > 14 ? `wk ${shortDate(d)}` : shortDate(d)}</span>)}</div>
            </>
          )}
        </div>
        <div className="card flex min-w-0 flex-[2_1_300px] flex-col gap-1">
          <h2 className="h2">Days away by type</h2>
          {kinds.map(([l, v, c]) => (
            <Row key={l}><span className="w-16 font-black">{l}</span><div className="flex-1"><Bar value={v / kindMax} color={c} /></div><span className="w-10 text-right font-black tabular-nums">{v}</span></Row>
          ))}
          {rows.length > 0 && (count("absent") + count("leave") > 0) && (
            <div className="mt-2"><Insight>
              {worst.n > 0 ? `${WD[worst.w]} have the most absences (${worst.n}). ` : ""}
              {mostAway ? `${mostAway.full_name} was away ${mostAway.absent + mostAway.leave} day${mostAway.absent + mostAway.leave === 1 ? "" : "s"} in this period.` : ""}
            </Insight></div>
          )}
        </div>
      </section>
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Per staff member · {rangeLabel}</h2>
          <Link href="/print/payslip/sheet" target="_blank" className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }}>Print salary sheet</Link></div>
        <div className="tbl mt-2 overflow-x-auto"><table className="w-full min-w-[640px]">
          <thead><tr>{["Staff", "Present", "Leave", "Absent", "Late", "Extra periods", "Attendance"].map((h) => <th key={h} className="text-left">{h}</th>)}</tr></thead>
          <tbody>{per.map((p) => {
            const r = p.total ? (p.present + p.late) / p.total : null;
            return (
              <tr key={p.id}><td><Link href={`/principal/staff/${p.id}`} className="font-black text-[#0369a1]">{p.full_name}</Link></td>
                <td className="tabular-nums">{p.present + p.late}</td><td className="tabular-nums">{p.leave}</td><td className="tabular-nums">{p.absent}</td><td className="tabular-nums">{p.late}</td><td className="tabular-nums">{p.extra}</td>
                <td>{r == null ? <span className="tagx">Not marked</span> : <span className={`tagx ${r >= 0.95 ? "g" : r >= 0.85 ? "y" : "r"}`}>{pct(r)}</span>}</td></tr>
            );
          })}</tbody>
        </table></div>
      </section>
    </>
  );
}
