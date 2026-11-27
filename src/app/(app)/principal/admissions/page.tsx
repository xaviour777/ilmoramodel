import Link from "next/link";
import { PageHead, Stats, Stat } from "@/components/ilm";
import { UnderTabs } from "@/components/classes-tabs";
import { requireRole } from "@/lib/me";
import { PhotoField } from "@/components/photo-field";
import { createClient } from "@/lib/supabase/server";
import { shortDate, todayPK } from "@/lib/format";
import { CHOICE_LABEL } from "@/lib/messages";
import { allRows } from "@/lib/outbox";
import { addInquiry, admitStudent, moveAdmission, setFollowUp } from "../actions";

type Stage = "inquiry" | "test" | "offered" | "admitted" | "declined";
const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "inquiry", label: "Inquiries", hint: "Call, then book an entry test" },
  { id: "test", label: "Entry test", hint: "Test booked: record the result and offer a seat" },
  { id: "offered", label: "Seat offered", hint: "Waiting for the parent: admit when they pay" },
  { id: "admitted", label: "Admitted", hint: "Last 6 months" },
  { id: "declined", label: "Declined", hint: "Last 6 months" },
];
const SOURCE: Record<string, string> = {
  walk_in: "Walk-in", referral: "Referred by a family", sibling: "Sibling already here", facebook: "Facebook",
  whatsapp: "WhatsApp", banner: "Banner / board", website: "Website", other: "Other",
};

type Row = {
  id: string; child_name: string; guardian_name: string; phone: string; status: Stage; test_on: string | null; notes: string | null;
  applying_class_id: string | null; created_at: string; follow_up_on: string | null; stage_since: string | null; source: string | null;
  referred_by_family_id: string | null; student_id: string | null; photo_url: string | null; classes: { name: string } | null; students: { admitted_on: string } | null;
};
type Sec = { id: string; name: string; class_id: string; capacity: number; classes: { name: string; sort: number } };

const digits = (p: string) => p.replace(/[^\d]/g, "");
const waLink = (p: string) => { const d = digits(p); return `https://wa.me/${d.startsWith("0") ? "92" + d.slice(1) : d}`; };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// The admissions desk: who to call today, every child by step with one clear next action,
// seats left per class, and where new families come from.
export default async function AdmissionsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; stage?: string; new?: string }> }) {
  const me = await requireRole("principal", "owner", "accountant");
  const sp = await searchParams;
  const stage: Stage = (STAGES.find((s) => s.id === sp.stage)?.id) ?? "inquiry";
  const supabase = await createClient();
  const today = todayPK();
  const sixMonthsAgo = new Date(Date.parse(today) - 182 * 86400000).toISOString().slice(0, 10);

  const [{ data: active }, { data: closed }, { data: classes }, { data: sections }, enrolled] = await Promise.all([
    supabase.from("admissions").select("*, classes(name), students(admitted_on)").in("status", ["inquiry", "test", "offered"]).order("created_at", { ascending: false }),
    supabase.from("admissions").select("*, classes(name), students(admitted_on)").in("status", ["admitted", "declined"]).gte("created_at", sixMonthsAgo).order("created_at", { ascending: false }),
    supabase.from("classes").select("id, name, sort").order("sort"),
    supabase.from("sections").select("id, name, class_id, capacity, classes(name, sort)"),
    allRows<{ section_id: string | null }>((a, b) => supabase.from("students").select("section_id").eq("status", "enrolled").order("id").range(a, b) as never),
  ]);
  const rows = [...((active ?? []) as Row[]), ...((closed ?? []) as Row[])];
  const { data: nextId } = await supabase.rpc("peek_student_code");
  const secs = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));

  // seats: capacity minus children studying, per section and per class
  const inSection = new Map<string, number>();
  for (const s of enrolled) if (s.section_id) inSection.set(s.section_id, (inSection.get(s.section_id) ?? 0) + 1);
  const seatsLeft = (s: Sec) => Math.max(0, s.capacity - (inSection.get(s.id) ?? 0));
  const byClass = (classes ?? []).map((c) => {
    const ss = secs.filter((s) => s.class_id === c.id);
    const cap = ss.reduce((n, s) => n + s.capacity, 0);
    const used = ss.reduce((n, s) => n + (inSection.get(s.id) ?? 0), 0);
    const waiting = rows.filter((r) => r.applying_class_id === c.id && (r.status === "test" || r.status === "offered")).length;
    return { ...c, cap, used, left: Math.max(0, cap - used), waiting };
  }).filter((c) => c.cap > 0);

  // brothers and sisters already in school, found by the parent's phone
  const phones = [...new Set(rows.filter((r) => r.status !== "admitted").map((r) => digits(r.phone)).filter(Boolean))];
  const famByPhone = new Map<string, { id: string; name: string }>();
  for (let i = 0; i < phones.length; i += 150) {
    const { data } = await supabase.from("families").select("id, name, phone").in("phone", phones.slice(i, i + 150));
    for (const f of data ?? []) if (f.phone) famByPhone.set(digits(f.phone), { id: f.id, name: f.name });
  }
  const refIds = [...new Set(rows.map((r) => r.referred_by_family_id).filter((x): x is string => !!x))];
  const { data: refFams } = refIds.length ? await supabase.from("families").select("id, name").in("id", refIds) : { data: [] as { id: string; name: string }[] };
  const refName = new Map((refFams ?? []).map((f) => [f.id, f.name]));

  // numbers for the top of the page
  const monthStart = today.slice(0, 8) + "01";
  const weekEnd = new Date(Date.parse(today) + 6 * 86400000).toISOString().slice(0, 10);
  const count = (s: Stage) => rows.filter((r) => r.status === s).length;
  const newThisMonth = rows.filter((r) => r.created_at.slice(0, 10) >= monthStart).length;
  const testsThisWeek = rows.filter((r) => r.status === "test" && r.test_on && r.test_on >= today && r.test_on <= weekEnd).length;
  const admittedThisMonth = rows.filter((r) => r.status === "admitted" && (r.students?.admitted_on ?? r.created_at.slice(0, 10)) >= monthStart).length;
  const decided = rows.filter((r) => r.status === "admitted" || r.status === "declined").length;
  const conversion = decided ? Math.round((count("admitted") / decided) * 100) : null;

  const callToday = rows
    .filter((r) => ["inquiry", "test", "offered"].includes(r.status) && ((r.follow_up_on && r.follow_up_on <= today) || (r.status === "test" && r.test_on === today)))
    .sort((a, b) => (a.follow_up_on ?? today).localeCompare(b.follow_up_on ?? today));

  // last six months: new inquiries and admissions
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.parse(monthStart)); d.setUTCMonth(d.getUTCMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
  const trend = months.map((m) => ({
    m,
    label: new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    inq: rows.filter((r) => r.created_at.slice(0, 7) === m).length,
    adm: rows.filter((r) => r.status === "admitted" && (r.students?.admitted_on ?? r.created_at).slice(0, 7) === m).length,
  }));
  const trendMax = Math.max(1, ...trend.map((t) => t.inq));
  const sources = Object.entries(rows.reduce<Record<string, number>>((acc, r) => { const k = r.source ?? "unknown"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}))
    .sort((a, b) => b[1] - a[1]);
  const sourceMax = Math.max(1, ...sources.map((s) => s[1]));

  const list = rows.filter((r) => r.status === stage)
    .sort((a, b) => stage === "test" ? (a.test_on ?? "9").localeCompare(b.test_on ?? "9") : b.created_at.localeCompare(a.created_at));
  const here = `/principal/admissions?stage=${stage}`;
  const info = STAGES.find((s) => s.id === stage)!;

  const Contact = ({ r }: { r: Row }) => (
    <div className="flex gap-2">
      <a href={`tel:${digits(r.phone)}`} aria-label={`Call ${r.guardian_name}`} className="grid h-10 w-10 place-items-center rounded-full bg-[#f1f5f9] text-[#1f2937]"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg></a>
      <a href={waLink(r.phone)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${r.guardian_name}`} className="grid h-10 w-10 place-items-center rounded-full bg-[#f1f5f9] text-[#1f2937]"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z" /></svg></a>
    </div>
  );

  return (
    <>
      <PageHead kick="People" title="Admissions" sub="From the first call to the first day. Admitting a child makes the family, the student and the first challan.">
        <a href="#new" className="btn">New inquiry</a>
      </PageHead>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">{sp.saved === "inquiry" ? "Inquiry added. It will show in Call today when the call-back date comes." : "Saved."}</div>}

      <Stats>
        <Stat label="New inquiries this month" value={newThisMonth.toLocaleString("en-PK")} />
        <Stat label="Entry tests this week" value={testsThisWeek.toLocaleString("en-PK")} />
        <Stat label="Seats offered, waiting" value={count("offered").toLocaleString("en-PK")} />
        <Stat label="Admitted this month" value={admittedThisMonth.toLocaleString("en-PK")} tone="#15803d" sub={conversion !== null ? `${conversion}% of decided families joined (6 months)` : undefined} />
      </Stats>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* who to call today */}
          <section className="card flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="h2 flex items-center gap-2"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>Call today</h2>
              <span className="pill pill-gray">{callToday.length}</span>
            </div>
            {callToday.length === 0 ? <p className="muted">No call-backs due. New inquiries get a call-back date two days ahead.</p> : (
              <ul className="divide-y divide-[#e5e7eb]">
                {callToday.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-[#1f2937]">{r.child_name} <span className="font-normal text-[#6b7280]">· {r.classes?.name ?? "class not set"}</span></div>
                      <div className="truncate text-[13px] text-[#6b7280]">
                        {r.guardian_name} · {r.status === "test" && r.test_on === today ? "Entry test today" : r.status === "offered" ? "Seat offered: ask about fee" : r.follow_up_on && r.follow_up_on < today ? `Call-back was ${shortDate(r.follow_up_on)}` : "Call-back today"}
                      </div>
                    </div>
                    <Contact r={r} />
                  </li>
                ))}
              </ul>
            )}
            {callToday.length > 8 && <p className="muted text-sm">{callToday.length - 8} more in the steps below.</p>}
          </section>

          {/* steps */}
          <section className="flex flex-col gap-3">
            <UnderTabs current={stage} tabs={STAGES.map((s) => ({ id: s.id, label: `${s.label} · ${count(s.id)}`, href: `/principal/admissions?stage=${s.id}` }))} />
            <p className="muted text-sm">{info.hint}</p>
            {list.length === 0 && <div className="card muted">Nobody in this step.</div>}
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((r) => {
                const sib = famByPhone.get(digits(r.phone));
                const waitDays = r.stage_since ? daysBetween(r.stage_since.slice(0, 10), today) : daysBetween(r.created_at.slice(0, 10), today);
                const classSecs = secs.filter((s) => !r.applying_class_id || s.class_id === r.applying_class_id);
                return (
                  <article key={r.id} className="card flex flex-col gap-3 !p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.photo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.photo_url} alt="" className="h-10 w-[30px] rounded-md object-cover" />)}
                          <span className="text-[16px] font-bold text-[#1f2937]">{r.child_name}</span>
                          <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[12px] text-[#1f2937]">{r.classes?.name ?? "Class not set"}</span>
                        </div>
                        <div className="text-[13px] text-[#6b7280]">{r.guardian_name} · {r.phone}</div>
                      </div>
                      {r.status !== "admitted" && <Contact r={r} />}
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-[12px]">
                      {sib && <Link href={`/principal/families/${sib.id}`} className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[#15803d]">Sibling here: {sib.name}</Link>}
                      {r.referred_by_family_id && <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[#15803d]">Referred by {refName.get(r.referred_by_family_id) ?? "a family"}</span>}
                      {r.source && r.source !== "referral" && <span className="rounded-full bg-[#e5e7eb] px-2 py-0.5 text-[#6b7280]">{SOURCE[r.source]}</span>}
                      {r.status === "test" && r.test_on && <span className={`rounded-full px-2 py-0.5 ${r.test_on < today ? "bg-[#fee2e2] text-[#dc2626]" : r.test_on === today ? "bg-[#fef3c7] text-[#1f2937]" : "bg-[#e5e7eb] text-[#6b7280]"}`}>Test {r.test_on === today ? "today" : shortDate(r.test_on)}{r.test_on < today ? ": result missing" : ""}</span>}
                      {["inquiry", "offered"].includes(r.status) && waitDays >= 3 && <span className="rounded-full bg-[#fee2e2] px-2 py-0.5 text-[#dc2626]">Waiting {waitDays} days</span>}
                      {r.follow_up_on && ["inquiry", "test", "offered"].includes(r.status) && r.status !== "test" && <span className="rounded-full bg-[#e5e7eb] px-2 py-0.5 text-[#6b7280]">Call {r.follow_up_on <= today ? "today" : shortDate(r.follow_up_on)}</span>}
                    </div>
                    {r.notes && <p className="text-[13px]">{r.notes}</p>}

                    {/* the one next step for this child */}
                    {r.status === "inquiry" && (
                      <form action={moveAdmission} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="admission_id" value={r.id} /><input type="hidden" name="status" value="test" /><input type="hidden" name="back" value={here} />
                        <label className="field min-w-0 flex-1 basis-36">Entry test on<input className="input" type="date" name="test_on" min={today} required /></label>
                        <button className="btn" type="submit">Book test</button>
                      </form>
                    )}
                    {r.status === "test" && (
                      <form action={moveAdmission} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="admission_id" value={r.id} /><input type="hidden" name="status" value="offered" /><input type="hidden" name="back" value={here} />
                        <label className="field min-w-0 flex-1 basis-40">Test result<input className="input" name="note" placeholder="Passed, 78% (English weak)" /></label>
                        <button className="btn" type="submit">Offer seat</button>
                      </form>
                    )}
                    {(r.status === "offered" || r.status === "inquiry" || r.status === "test") && (
                      <details className="rounded-lg bg-[#f1f5f9] px-3 py-2" open={r.status === "offered"}>
                        <summary className="cursor-pointer text-[13px] font-bold text-[#1f2937]">{r.status === "offered" ? "Admit (when the fee is paid)" : "Admit straight away"}</summary>
                        <form action={admitStudent} className="mt-2 flex flex-col gap-2">
                          <input type="hidden" name="admission_id" value={r.id} />
                          <div className="flex gap-2">
                            <select className="input min-w-0 flex-1" name="section_id" required aria-label="Section">
                              {classSecs.map((s) => <option key={s.id} value={s.id} disabled={seatsLeft(s) === 0}>{s.classes.name}-{s.name} · {seatsLeft(s) === 0 ? "full" : `${seatsLeft(s)} seats left`}</option>)}
                            </select>
                            <input className="input w-20" name="roll_no" placeholder="Roll" aria-label="Roll number" />
                          </div>
                          <p className="muted text-xs">Student ID will be <b>{nextId ?? "given automatically"}</b>.</p>
                          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="first_challan" defaultChecked className="h-4 w-4" /> Make the first challan (admission + this month)</label>
                          <button className="btn" type="submit">Admit</button>
                        </form>
                      </details>
                    )}
                    {r.status === "admitted" && (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[#15803d]">Admitted{r.students?.admitted_on ? ` ${shortDate(r.students.admitted_on)}` : ""}</span>
                        {r.student_id && <Link className="font-semibold text-[#1f2937] underline" href={`/principal/students/${r.student_id}`}>Open student</Link>}
                      </div>
                    )}

                    {["inquiry", "test", "offered"].includes(r.status) && (
                      <details>
                        <summary className="cursor-pointer text-[13px] text-[#6b7280]">Call back later or decline</summary>
                        <form action={setFollowUp} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="admission_id" value={r.id} /><input type="hidden" name="back" value={here} />
                          <label className="field basis-36">Call back on<input className="input" type="date" name="follow_up_on" min={today} defaultValue={r.follow_up_on ?? ""} /></label>
                          <label className="field min-w-0 flex-1 basis-40">What they said<input className="input" name="note" placeholder="Will visit after salary" /></label>
                          <button className="btn-ghost" type="submit">Save</button>
                        </form>
                        <form action={moveAdmission} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="admission_id" value={r.id} /><input type="hidden" name="status" value="declined" /><input type="hidden" name="back" value={here} />
                          <label className="field min-w-0 flex-1 basis-40">Why not joining<input className="input" name="note" placeholder="Fee too high, too far, chose another school" /></label>
                          <button className="btn-ghost text-[#dc2626]" type="submit">Decline</button>
                        </form>
                      </details>
                    )}
                    {r.status === "declined" && (
                      <form action={moveAdmission}>
                        <input type="hidden" name="admission_id" value={r.id} /><input type="hidden" name="status" value="inquiry" /><input type="hidden" name="back" value={here} />
                        <button className="btn-ghost" type="submit">Bring back to inquiries</button>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        {/* right side: seats and reports */}
        <aside className="flex flex-col gap-4">
          <section className="card flex flex-col gap-3">
            <h2 className="h2">Seats left by class</h2>
            {byClass.length === 0 && <p className="muted">Add classes and sections first.</p>}
            <ul className="flex flex-col gap-2.5">
              {byClass.map((c) => {
                const pctUsed = Math.min(100, Math.round((c.used / c.cap) * 100));
                return (
                  <li key={c.id}>
                    <div className="flex justify-between text-[13px]"><span className="font-semibold">{c.name}</span>
                      <span className={c.left === 0 ? "font-bold text-[#dc2626]" : c.left <= 3 ? "font-bold text-[#b45309]" : "text-[#6b7280]"}>{c.left === 0 ? "Full" : `${c.left} left`}{c.waiting ? ` · ${c.waiting} in test/offer` : ""}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-[#e5e7eb]"><div className={`h-2 rounded-full ${pctUsed >= 100 ? "bg-[#dc2626]" : pctUsed >= 90 ? "bg-[#f59e0b]" : "bg-[#16a34a]"}`} style={{ width: `${pctUsed}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card flex flex-col gap-3">
            <h2 className="h2">Last 6 months</h2>
            <div className="flex h-36 items-end gap-2" role="img" aria-label="New inquiries and admissions per month">
              {trend.map((t) => (
                <div key={t.m} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-28 w-full items-end justify-center gap-0.5">
                    <div className="w-1/2 rounded-t bg-[#0ea5e9]-fixed-dim" style={{ height: `${(t.inq / trendMax) * 100}%` }} title={`${t.inq} inquiries`} />
                    <div className="w-1/2 rounded-t bg-[#16a34a]" style={{ height: `${(t.adm / trendMax) * 100}%` }} title={`${t.adm} admitted`} />
                  </div>
                  <span className="text-[11px] text-[#6b7280]">{t.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-[12px] text-[#6b7280]">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#0ea5e9]-fixed-dim" />Inquiries</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#16a34a]" />Admitted</span>
            </div>
          </section>

          <section className="card flex flex-col gap-3">
            <h2 className="h2">Where families come from</h2>
            <ul className="flex flex-col gap-2">
              {sources.map(([k, n]) => (
                <li key={k}>
                  <div className="flex justify-between text-[13px]"><span>{SOURCE[k] ?? "Not recorded"}</span><span className="font-semibold">{n}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-[#e5e7eb]"><div className="h-2 rounded-full bg-[#0ea5e9]" style={{ width: `${(n / sourceMax) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <form id="new" action={addInquiry} className="card flex max-w-3xl scroll-mt-24 flex-col gap-3">
        <input type="hidden" name="back" value={here} />
        <h2 className="h2">New inquiry</h2>
        <PhotoField campusId={me.campus_id} />
        <div className="rounded-[12px] bg-[#f0fdf4] px-3 py-2 text-[14px] font-extrabold text-[#15803d]">Student ID will be <span className="font-black">{nextId ?? "given automatically"}</span> · given when admitted</div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="field">Child&apos;s name<input className="input" name="child_name" required /></label>
          <label className="field">Parent or guardian<input className="input" name="guardian_name" required /></label>
          <label className="field">Phone<input className="input" name="phone" required inputMode="tel" placeholder="03001234567" /></label>
          <label className="field">Class applying for<select className="input" name="class_id"><option value="">Not sure yet</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="field">How did they hear of us
            <select className="input" name="source" defaultValue="">
              <option value="">Not asked</option>
              {Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field">Referred by (that family&apos;s phone)<input className="input" name="referrer_phone" inputMode="tel" placeholder="Optional: 03001234567" /></label>
          <label className="field">Call back on<input className="input" type="date" name="follow_up_on" min={today} /><span className="muted text-xs">Empty: in two days.</span></label>
          <label className="field">Notes<input className="input" name="notes" placeholder="Walk-in, wants Computer group" /></label>
        </div>
        <details>
          <summary className="eyebrow cursor-pointer">Reminders and more details (fills the student record and the board form)</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="field">Number for fee reminders and notices<input className="input" name="reminder_phone" inputMode="tel" placeholder="Leave empty to use the phone above" /></label>
            <label className="field">Send them by
              <select className="input" name="reminder_channel" defaultValue="auto">
                {Object.entries(CHOICE_LABEL).map(([k, v]) => <option key={k} value={k}>{k === "auto" ? `${v} (WhatsApp first, SMS if no reply)` : v}</option>)}
              </select>
            </label>
            <label className="field">Child&apos;s B-form no<input className="input" name="b_form" placeholder="35202-1234567-1" /></label>
            <label className="field">Father&apos;s CNIC<input className="input" name="father_cnic" placeholder="35202-1234567-1" /></label>
            <label className="field">Date of birth<input className="input" type="date" name="date_of_birth" /></label>
            <label className="field">Gender<select className="input" name="gender" defaultValue=""><option value="">Not set</option><option value="male">Boy</option><option value="female">Girl</option></select></label>
            <label className="field">Previous school<input className="input" name="previous_school" /></label>
            <label className="field">Last class passed<input className="input" name="last_class_passed" placeholder="Class 5" /></label>
          </div>
          <label className="field mt-3">Home address<input className="input" name="address" /></label>
        </details>
        <button className="btn self-start" type="submit">Add inquiry</button>
      </form>
    </>
  );
}
