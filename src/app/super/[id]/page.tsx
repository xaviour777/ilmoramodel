import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stateOf } from "@/lib/super";
import { rupees, shortDate, todayPK } from "@/lib/format";
import { PageHead, Stats, Stat, Row, Empty } from "@/components/ilm";
import { setPassword, setStatus, updateSchool } from "../actions";

type Detail = {
  school: { id: string; name: string; city: string | null; custom_domain: string | null; logo_url: string | null; primary_color: string | null; support_email: string | null;
    status: string; trial_ends_on: string | null; plan: string; max_students: number | null; notes: string | null; created_at: string } | null;
  campuses: { id: string; name: string; city: string | null; students: number; classes: number }[];
  people: { id: string; name: string; email: string | null; role: string; active: boolean; last_login: string | null }[];
  usage: { teachers: number; families: number; attendance_days_30: number; fees_month_paisa: number; messages_month: number; ai_calls_month: number };
  audit: { at: string; action: string; detail: Record<string, unknown> }[];
};

export default async function SuperSchool({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("super_school", { p_school: id });
  const d = data as Detail | null;
  if (error) return <div className="notice-bad">{error.message}</div>;
  if (!d?.school) notFound();
  const s = d.school;
  const today = todayPK();
  const st = stateOf(s, today);
  const students = d.campuses.reduce((t, c) => t + Number(c.students), 0);
  const host = s.custom_domain?.split(".")[0];
  const apex = s.custom_domain && s.custom_domain.split(".").length <= 2;
  const btn = { minHeight: 36, padding: "0 12px", fontSize: 12 } as const;

  return (
    <>
      <PageHead kick={`Platform · added ${shortDate(s.created_at.slice(0, 10))}`} title={s.name} sub={[s.city, s.custom_domain ?? "no domain yet", `${s.plan} plan`].filter(Boolean).join(" · ")}>
        <span className={`tagx ${st.tone}`}>{st.label}</span>
        {s.custom_domain && <a href={`https://${s.custom_domain}`} target="_blank" rel="noreferrer" className="btn-ghost">Open site</a>}
      </PageHead>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">{sp.saved === "created" ? "School created. The principal can sign in now." : sp.saved === "password" ? "Password set." : "Saved."}</div>}

      <Stats>
        <Stat label="Students" value={students.toLocaleString("en-IN")} sub={s.max_students ? `limit ${s.max_students}` : "no limit"} tone={s.max_students && students > s.max_students ? "#b91c1c" : undefined} />
        <Stat label="Teachers" value={d.usage.teachers} sub={`${d.usage.families} families`} />
        <Stat label="Attendance days" value={d.usage.attendance_days_30} sub="marked in the last 30 days" />
        <Stat label="Fees this month" value={rupees(Number(d.usage.fees_month_paisa))} sub="received in the app" />
        <Stat label="Messages · AI" value={`${d.usage.messages_month} · ${d.usage.ai_calls_month}`} sub="this month" />
      </Stats>

      <section className="flex flex-wrap items-start gap-5">
        <form action={updateSchool} className="card flex min-w-0 flex-[3_1_480px] flex-col gap-3">
          <input type="hidden" name="school_id" value={s.id} />
          <h2 className="h2">Branding and domain</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">School name<input className="input" name="name" defaultValue={s.name} required /></label>
            <label className="field">City<input className="input" name="city" defaultValue={s.city ?? ""} /></label>
            <label className="field">Domain<input className="input" name="custom_domain" defaultValue={s.custom_domain ?? ""} placeholder="lms.school.edu.pk" /></label>
            <label className="field">Support email<input className="input" name="support_email" type="email" defaultValue={s.support_email ?? ""} /></label>
            <label className="field">Logo link<input className="input" name="logo_url" type="url" defaultValue={s.logo_url ?? ""} /></label>
            <label className="field">Brand colour<input className="input" name="primary_color" type="color" defaultValue={s.primary_color ?? "#16a34a"} /></label>
            <label className="field">Plan<select className="input" name="plan" defaultValue={s.plan}><option value="basic">Basic</option><option value="standard">Standard</option><option value="premium">Premium</option></select></label>
            <label className="field">Student limit<input className="input" name="max_students" type="number" min={1} defaultValue={s.max_students ?? ""} /></label>
          </div>
          <label className="field">Notes (only you see these)<textarea className="input min-h-20 py-2" name="notes" defaultValue={s.notes ?? ""} /></label>
          <button className="btn self-start" type="submit">Save</button>
        </form>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
          <div className="card flex flex-col gap-2.5">
            <h2 className="h2">Status and trial</h2>
            <p className="muted text-[13px]">{s.status === "trial" ? `Trial ends ${s.trial_ends_on ? shortDate(s.trial_ends_on) : "—"}.` : s.status === "suspended" ? "Suspended: nobody at this school can use the app. Data is kept." : "Active: everyone can use the app."}
              {" "}When a trial ends or a school is suspended, its people see a message at sign-in and nothing else; all data stays.</p>
            <div className="flex flex-wrap gap-2">
              {[7, 14, 30].map((n) => (
                <form key={n} action={setStatus}><input type="hidden" name="school_id" value={s.id} /><input type="hidden" name="status" value="trial" /><input type="hidden" name="days" value={n} />
                  <input type="hidden" name="from" value={s.status === "trial" ? s.trial_ends_on ?? "" : ""} /><input type="hidden" name="label" value={`trial +${n} days`} />
                  <button className="btn-ghost" style={btn} type="submit">{s.status === "trial" ? `Extend trial +${n}` : `Start ${n}-day trial`}</button></form>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {s.status !== "active" && <form action={setStatus}><input type="hidden" name="school_id" value={s.id} /><input type="hidden" name="status" value="active" /><input type="hidden" name="label" value="activated" />
                <button className="btn" style={btn} type="submit">Activate</button></form>}
              {s.status !== "suspended" && <form action={setStatus}><input type="hidden" name="school_id" value={s.id} /><input type="hidden" name="status" value="suspended" /><input type="hidden" name="label" value="suspended" />
                <button className="btn-ghost" style={{ ...btn, color: "#b91c1c" }} type="submit">Suspend</button></form>}
            </div>
          </div>

          <div className="card">
            <h2 className="h2">Connect the domain</h2>
            {!s.custom_domain ? <p className="muted mt-1 text-[13px]">Set a domain on the left first.</p> : (
              <ol className="mt-2 ml-5 flex list-decimal flex-col gap-2 text-[14px] font-bold">
                <li>Vercel → project <b>ilmoramodel</b> → Settings → Domains → Add <code className="rounded bg-[#f1f5f9] px-1">{s.custom_domain}</code></li>
                <li>In the school&apos;s DNS (Cloudflare or registrar) add:
                  <div className="mt-1 overflow-x-auto rounded-[12px] border-2 border-[#e5e7eb] bg-[#f8fafc] p-2 font-mono text-[12px]">
                    {apex ? <>A &nbsp; @ &nbsp; 76.76.21.21</> : <>CNAME &nbsp; {host} &nbsp; cname.vercel-dns.com</>}
                  </div>
                  <span className="muted text-[12px]">In Cloudflare keep it &ldquo;DNS only&rdquo; (grey cloud) until Vercel shows Valid Configuration.</span></li>
                <li>Open <a className="text-[#0369a1] underline" href={`https://${s.custom_domain}/login`} target="_blank" rel="noreferrer">{s.custom_domain}/login</a>: it should show {s.name}&apos;s name and colour.</li>
              </ol>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-start gap-5">
        <div className="card min-w-0 flex-[3_1_480px]">
          <h2 className="h2">Principal and office logins</h2>
          {d.people.length === 0 && <div className="mt-2"><Empty>No principal or office staff yet.</Empty></div>}
          {d.people.map((p) => (
            <Row key={p.id}>
              <div className="min-w-[160px] flex-1"><div className="font-black">{p.name} <span className="tagx">{p.role}</span>{!p.active && <span className="tagx r ml-1">inactive</span>}</div>
                <div className="muted text-[12px]">{p.email ?? "no email"} · {p.last_login ? `last login ${shortDate(p.last_login.slice(0, 10))}` : "never signed in"}</div></div>
              {p.email && (
                <form action={setPassword} className="flex gap-2">
                  <input type="hidden" name="school_id" value={s.id} /><input type="hidden" name="profile_id" value={p.id} />
                  <input className="input w-40" style={{ minHeight: 36 }} name="password" minLength={8} required placeholder="New password" aria-label={`New password for ${p.name}`} autoComplete="off" />
                  <button className="btn-ghost" style={btn} type="submit">Set</button>
                </form>
              )}
            </Row>
          ))}
          <h2 className="h2 mt-4">Campuses</h2>
          {d.campuses.map((c) => <Row key={c.id}><span className="flex-1 font-black">{c.name}{c.city ? ` · ${c.city}` : ""}</span><span className="muted text-[12px]">{c.classes} classes · {c.students} students</span></Row>)}
        </div>
        <div className="card min-w-0 flex-[2_1_320px]">
          <h2 className="h2">History</h2>
          {d.audit.length === 0 && <div className="mt-2"><Empty>Nothing recorded yet.</Empty></div>}
          {d.audit.map((a, i) => (
            <Row key={i}><span className="flex-1 font-bold">{a.action}</span><span className="muted text-[12px]">{new Date(a.at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></Row>
          ))}
          <Link href="/super/activity" className="mt-2 inline-block text-[13px] font-black text-[#0369a1]">All activity →</Link>
        </div>
      </section>
    </>
  );
}
