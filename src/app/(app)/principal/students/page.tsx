import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { pct, rupees, todayPK } from "@/lib/format";
import { PageHead, Stats, Stat, Chips, Insight, Empty, Bar } from "@/components/ilm";
import { addStudent } from "./actions";

type Search = { q?: string; section?: string; status?: string; f?: string; id?: string; page?: string; error?: string };
const STATUS: Record<string, [string, string]> = { enrolled: ["Studying", "g"], left: ["Left", ""], struck_off: ["Struck off", "r"], passed_out: ["Passed out", "b"] };
const PAGE = 50;
const DAY = 86400000;
const NONE = ["00000000-0000-0000-0000-000000000000"];

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const page = Math.max(0, Number(sp.page) || 0);
  const filter = ["fees", "absent", "low", "left", "struck_off", "passed_out"].includes(sp.f ?? "") ? sp.f! : "all";
  const status = filter === "left" || filter === "struck_off" || filter === "passed_out" ? filter : sp.status && STATUS[sp.status] ? sp.status : "enrolled";
  const q = (sp.q ?? "").replace(/[%,()]/g, "").trim();
  const since = new Date(Date.parse(today) - 20 * DAY).toISOString().slice(0, 10);

  const [{ data: sections }, { data: enrolled }, { data: year }, { data: owing }, { data: absences }, { data: resultExams }] = await Promise.all([
    supabase.from("sections").select("id, name, classes(name, sort)"),
    supabase.from("students").select("id, gender, family_id, admitted_on, created_at").eq("status", "enrolled"),
    supabase.from("academic_sessions").select("starts_on").eq("is_current", true).maybeSingle(),
    supabase.from("family_balances").select("family_id, balance_paisa").gt("balance_paisa", 0),
    supabase.from("attendance").select("student_id").eq("status", "absent").gte("date", since),
    supabase.from("exams").select("id, total_marks, terms!inner(academic_sessions!inner(is_current))").eq("status", "results").eq("terms.academic_sessions.is_current", true),
  ]);
  type Sec = { id: string; name: string; classes: { name: string; sort: number } };
  const secs = ((sections ?? []) as unknown as Sec[]).sort((a, b) => a.classes.sort - b.classes.sort || a.name.localeCompare(b.name));
  const examTotal = new Map((resultExams ?? []).map((e) => [e.id, e.total_marks || 100]));
  const { data: allMarks } = examTotal.size
    ? await supabase.from("marks").select("student_id, exam_id, obtained, subjects(name)").in("exam_id", [...examTotal.keys()]).eq("is_absent", false).not("obtained", "is", null).limit(30000)
    : { data: [] };
  type M = { student_id: string; exam_id: string; obtained: number; subjects: { name: string } };
  const markRows = (allMarks ?? []) as unknown as M[];
  const avgOf = new Map<string, { s: number; n: number }>();
  for (const m of markRows) { const c = avgOf.get(m.student_id) ?? { s: 0, n: 0 }; c.s += Number(m.obtained) / (examTotal.get(m.exam_id) ?? 100); c.n++; avgOf.set(m.student_id, c); }
  const avg = (id: string) => { const c = avgOf.get(id); return c?.n ? c.s / c.n : null; };

  const en = enrolled ?? [];
  const sessionStart = year?.starts_on ?? today.slice(0, 4) + "-01-01";
  const owingFam = new Map((owing ?? []).map((o) => [o.family_id, Number(o.balance_paisa)]));
  const absentN = new Map<string, number>();
  for (const a of absences ?? []) absentN.set(a.student_id, (absentN.get(a.student_id) ?? 0) + 1);
  const famSize = new Map<string, number>();
  for (const s of en) if (s.family_id) famSize.set(s.family_id, (famSize.get(s.family_id) ?? 0) + 1);
  const absentIds = [...absentN.entries()].filter(([, n]) => n >= 3).map(([id]) => id);
  const lowIds = en.filter((s) => (avg(s.id) ?? 1) < 0.5).map((s) => s.id);
  const atRisk = new Set([...absentIds, ...lowIds]);
  const { data: nextId } = await supabase.rpc("peek_student_code");
  const { count: signups } = await supabase.from("signup_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  const { count: leftThisSession } = await supabase.from("students").select("id", { count: "exact", head: true }).neq("status", "enrolled").gte("left_on", sessionStart);

  // a phone number finds the family's children too
  let familyIds: string[] = [];
  if (q && /\d{4,}/.test(q)) {
    const { data: fams } = await supabase.from("families").select("id").or(`phone.ilike.%${q}%,reminder_phone.ilike.%${q}%`).limit(50);
    familyIds = (fams ?? []).map((f) => f.id);
  }
  let query = supabase.from("students")
    .select("id, full_name, roll_no, admission_no, status, section_id, family_id, families(name, phone, reminder_phone), sections(name, classes(name))", { count: "exact" })
    .eq("status", status).order("full_name").range(page * PAGE, page * PAGE + PAGE - 1);
  if (sp.section) query = query.eq("section_id", sp.section);
  if (filter === "fees") query = query.in("family_id", owingFam.size ? [...owingFam.keys()].slice(0, 300) : NONE);
  if (filter === "absent") query = query.in("id", absentIds.length ? absentIds.slice(0, 300) : NONE);
  if (filter === "low") query = query.in("id", lowIds.length ? lowIds.slice(0, 300) : NONE);
  if (q) {
    const ors = [`full_name.ilike.%${q}%`, `roll_no.ilike.%${q}%`, `admission_no.ilike.%${q}%`, `legacy_admission_no.ilike.%${q}%`, `b_form.ilike.%${q}%`];
    if (familyIds.length) ors.push(`family_id.in.(${familyIds.join(",")})`);
    query = query.or(ors.join(","));
  }
  const { data: rows, count } = await query;
  type R = { id: string; full_name: string; roll_no: string | null; admission_no: string | null; status: string; family_id: string | null; families: { name: string; phone: string | null; reminder_phone: string | null } | null; sections: { name: string; classes: { name: string } } | null };
  const list = (rows ?? []) as unknown as R[];
  const ids = list.map((r) => r.id);
  const { data: att } = ids.length
    ? await supabase.from("attendance").select("student_id, status").in("student_id", ids).gte("date", new Date(Date.parse(today) - 30 * DAY).toISOString().slice(0, 10))
    : { data: [] };
  const attOf = new Map<string, { p: number; n: number }>();
  for (const a of att ?? []) { const c = attOf.get(a.student_id) ?? { p: 0, n: 0 }; c.n++; if (a.status === "present" || a.status === "late") c.p++; attOf.set(a.student_id, c); }
  const attRate = (id: string) => { const c = attOf.get(id); return c?.n ? c.p / c.n : null; };

  const sel = list.find((r) => r.id === sp.id) ?? list[0];
  const selSubjects = sel ? [...markRows.filter((m) => m.student_id === sel.id).reduce((mp, m) => {
    const c = mp.get(m.subjects.name) ?? { s: 0, n: 0 }; c.s += Number(m.obtained) / (examTotal.get(m.exam_id) ?? 100); c.n++; return mp.set(m.subjects.name, c);
  }, new Map<string, { s: number; n: number }>()).entries()].map(([n, c]) => ({ n, r: c.s / c.n })).sort((a, b) => b.r - a.r) : [];
  const selDue = sel?.family_id ? owingFam.get(sel.family_id) ?? 0 : 0;
  const link = (o: Partial<Search>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, section: sp.section, f: filter === "all" ? undefined : filter, page: sp.page, ...o })) if (v) p.set(k, String(v));
    return `/principal/students?${p}`;
  };
  const total = count ?? 0;
  const boys = en.filter((s) => s.gender === "male").length, girls = en.filter((s) => s.gender === "female").length;
  const phone = sel?.families?.reminder_phone || sel?.families?.phone;
  const ini = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

  return (
    <>
      <PageHead kick="People" title="Students" sub="Every student's marks, attendance and fees in one profile.">
        <Link href="/principal/students/requests" className="btn-ghost">Sign-up requests{signups ? ` · ${signups}` : ""}</Link>
        <Link href="/principal/students/board" className="btn-ghost">Board registration</Link>
        <Link href="#add" className="btn">Add student</Link>
      </PageHead>
      {sp.error && <div className="notice-bad">{sp.error}</div>}

      <Stats>
        <Stat label="Enrolled" value={en.length.toLocaleString("en-IN")} sub={boys + girls ? `${boys} boys · ${girls} girls` : "gender not recorded"} />
        <Stat label="New this session" value={en.filter((s) => (s.admitted_on ?? s.created_at?.slice(0, 10) ?? "") >= sessionStart).length} tone="#15803d" sub={`${leftThisSession ?? 0} left, struck off or passed out`} />
        <Stat label="Siblings" value={[...famSize.values()].filter((n) => n >= 2).length} sub="families with 2+ children" />
        <Stat label="At risk" value={atRisk.size} tone={atRisk.size ? "#b91c1c" : undefined} sub="3+ absences in 3 weeks, or below 50%" href={link({ f: "absent", page: undefined, id: undefined })} />
      </Stats>

      <div className="flex flex-wrap items-center gap-2.5">
        <form className="flex min-w-[260px] flex-[1_1_320px] gap-2">
          {filter !== "all" && <input type="hidden" name="f" value={filter} />}
          <input className="input flex-1" name="q" defaultValue={sp.q} aria-label="Search students" placeholder="Name, roll no, B-form or parent phone" />
          <select className="input w-36" name="section" defaultValue={sp.section ?? ""} aria-label="Class">
            <option value="">All classes</option>{secs.map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}</option>)}
          </select>
          <button className="btn-ghost" type="submit">Search</button>
        </form>
        <Chips label="Filter students" current={filter} items={[
          { id: "all", label: "All" }, { id: "fees", label: `Fee due (${owingFam.size} families)` }, { id: "absent", label: `Absent often (${absentIds.length})` },
          { id: "low", label: `Below 50% (${lowIds.length})` }, { id: "left", label: "Left" }, { id: "struck_off", label: "Struck off" }, { id: "passed_out", label: "Passed out" },
        ].map((c) => ({ ...c, href: link({ f: c.id === "all" ? undefined : c.id, page: undefined, id: undefined }) }))} />
      </div>

      <section className="flex flex-wrap items-start gap-5">
        <div className="card min-w-0 flex-[3_1_520px]">
          <div className="hidden grid-cols-[1fr_70px_70px_90px] gap-2 px-2 pb-1 sm:grid"><span className="kick">Student</span><span className="kick text-right">Average</span><span className="kick text-right">Attend.</span><span /></div>
          {list.map((r) => {
            const a = avg(r.id), t = attRate(r.id);
            const due = r.family_id ? owingFam.get(r.family_id) : undefined;
            const tag = r.status !== "enrolled" ? [STATUS[r.status][0], STATUS[r.status][1]] : (absentN.get(r.id) ?? 0) >= 3 ? ["Absent often", "r"] : a != null && a < 0.5 ? ["Low marks", "y"] : due ? ["Fee due", "y"] : ["Good", "g"];
            return (
              <Link key={r.id} href={link({ id: r.id })} scroll={false} aria-current={r.id === sel?.id ? "true" : undefined}
                className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-[14px] border-2 px-2 py-2 sm:grid-cols-[1fr_70px_70px_90px] ${r.id === sel?.id ? "border-[#7dd3fc] bg-[#f0f9ff]" : "border-transparent hover:bg-[#f8fafc]"}`}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#ede9fe] text-[13px] font-black text-[#6d28d9]">{ini(r.full_name)}</span>
                  <span className="min-w-0"><span className="block truncate font-black">{r.full_name}</span>
                    <span className="muted block truncate text-[12px]">{r.admission_no ? `${r.admission_no} · ` : ""}{r.sections ? `${r.sections.classes.name}-${r.sections.name}` : "No class"}{r.roll_no ? ` · Roll ${r.roll_no}` : ""}</span></span>
                </span>
                <span className="hidden text-right font-black tabular-nums sm:block">{a == null ? "—" : pct(a)}</span>
                <span className="hidden text-right font-black tabular-nums sm:block">{t == null ? "—" : pct(t)}</span>
                <span className={`tagx ${tag[1]} justify-self-end`}>{tag[0]}</span>
              </Link>
            );
          })}
          {list.length === 0 && <Empty>No student matches.</Empty>}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="muted text-[12px]">Showing {list.length} of {total} · average of published marks this session, attendance last 30 days</span>
            <span className="flex gap-3">
              {page > 0 && <Link href={link({ page: String(page - 1), id: undefined })} className="text-[13px] font-black text-[#0369a1]">‹ Previous</Link>}
              {(page + 1) * PAGE < total && <Link href={link({ page: String(page + 1), id: undefined })} className="text-[13px] font-black text-[#0369a1]">Next ›</Link>}
            </span>
          </div>
          {sp.section && <Link href={`/print/board-list?section=${sp.section}`} target="_blank" className="mt-1 inline-block text-[13px] font-black text-[#0369a1]">Board list for this section</Link>}
        </div>

        {sel && (
          <aside className="card flex min-w-0 flex-[2_1_340px] flex-col gap-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-[#ede9fe] text-[18px] font-black text-[#6d28d9]">{ini(sel.full_name)}</span>
              <div className="min-w-0"><h2 className="h2 truncate">{sel.full_name}</h2>
                <div className="muted text-[13px]">{sel.admission_no ? `${sel.admission_no} · ` : ""}{sel.sections ? `${sel.sections.classes.name}-${sel.sections.name}` : "No class"}{sel.roll_no ? ` · Roll ${sel.roll_no}` : ""}{sel.families?.name ? ` · ${sel.families.name}` : ""}</div></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[["Average", avg(sel.id) == null ? "—" : pct(avg(sel.id)!)], ["Attend.", attRate(sel.id) == null ? "—" : pct(attRate(sel.id)!)], ["Fee due", selDue ? rupees(selDue) : "Nil"]].map(([l, v]) => (
                <div key={l} className="rounded-[14px] border-2 border-[#e5e7eb] p-2.5"><div className="kick" style={{ fontSize: 10 }}>{l}</div><div className="text-[17px] font-black tabular-nums">{v}</div></div>
              ))}
            </div>
            <Insight>{[
              selSubjects.length ? `Best in ${selSubjects[0].n} (${pct(selSubjects[0].r)})${selSubjects.length > 1 ? `, weakest in ${selSubjects.at(-1)!.n} (${pct(selSubjects.at(-1)!.r)})` : ""}.` : "No published marks this session yet.",
              absentN.get(sel.id) ? `${absentN.get(sel.id)} absence${absentN.get(sel.id) === 1 ? "" : "s"} in the last 3 weeks.` : "No absences in the last 3 weeks.",
              selDue ? `Family owes ${rupees(selDue)}.` : "",
            ].filter(Boolean).join(" ")}</Insight>
            <div>
              <div className="kick mb-1.5">Subjects this session</div>
              {selSubjects.map((x) => (
                <div key={x.n} className="flex items-center gap-2.5 py-1"><span className="w-28 truncate text-[14px] font-bold">{x.n}</span><div className="flex-1"><Bar value={x.r} color={x.r < 0.5 ? "#ef4444" : x.r < 0.7 ? "#f59e0b" : "#16a34a"} /></div><span className="w-11 text-right font-black tabular-nums">{pct(x.r)}</span></div>
              ))}
              {!selSubjects.length && <p className="muted text-[13px]">Nothing yet.</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {phone ? <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="btn-ghost" style={{ minHeight: 38, fontSize: 12 }}>Call parent</a> : <span className="btn-ghost opacity-50" style={{ minHeight: 38, fontSize: 12 }}>No phone</span>}
              <Link href={`/print/report-card/${sel.id}`} target="_blank" className="btn-ghost" style={{ minHeight: 38, fontSize: 12 }}>Report card</Link>
              <Link href={`/principal/students/${sel.id}`} className="btn-ghost" style={{ minHeight: 38, fontSize: 12 }}>Fee history</Link>
              <Link href={`/principal/students/${sel.id}`} className="btn" style={{ minHeight: 38, fontSize: 12 }}>Full profile</Link>
            </div>
          </aside>
        )}
      </section>

      <form id="add" action={addStudent} className="card flex scroll-mt-6 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Add a student</h2>
          <Link href="/principal/admissions" className="text-[13px] font-black text-[#0369a1]">New family? Use Admissions →</Link></div>
        <p className="muted text-[13px]">For a child already admitted. Student ID will be <b>{nextId ?? "given automatically"}</b>.</p>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label className="field">Student&apos;s name<input className="input" name="full_name" required /></label>
          <label className="field">Class
            <select className="input" name="section_id" required>{secs.map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}</option>)}</select>
          </label>
          <label className="field">Roll no<input className="input" name="roll_no" /></label>
          <label className="field">Gender
            <select className="input" name="gender" defaultValue=""><option value="">Not set</option><option value="male">Boy</option><option value="female">Girl</option></select>
          </label>
          <label className="field">Date of birth<input className="input" type="date" name="date_of_birth" /></label>
          <label className="field">Father / guardian<input className="input" name="guardian_name" /></label>
          <label className="field">Parent&apos;s mobile<input className="input" name="phone" inputMode="tel" required placeholder="03001234567" /></label>
          <label className="field">Address<input className="input" name="address" /></label>
        </div>
        <button className="btn self-start" type="submit">Add student</button>
      </form>
    </>
  );
}
