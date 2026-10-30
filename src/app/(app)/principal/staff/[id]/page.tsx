import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { StaffTabs } from "@/components/staff-tabs";
import { PhotoUpload } from "@/components/photo-upload";
import { rupees, shortDate, todayPK } from "@/lib/format";
import { advanceState, PAY_MODE } from "@/lib/payroll";
import { giveAdvance, saveStaffBasic, saveStaffDetails } from "../actions";

const ROLE: Record<string, string> = { principal: "Principal", teacher: "Teacher", accountant: "Accountant", owner: "Owner" };
const rs = (p: number | null | undefined) => (p ? String(Math.round(Number(p) / 100)) : "");

// One staff member's full record: personal, education, previous schools, bank, salary, advances, payslips.
export default async function StaffRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole("principal", "owner", "accountant");
  const admin = me.role !== "accountant";
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const since = todayPK().slice(0, 8) + "01";
  const [{ data: p }, { data: d }, { data: advances }, { data: salaries }, { data: att }, { data: sections }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, phone, email, user_id, is_active, avatar_url").eq("id", id).maybeSingle(),
    supabase.from("staff_details").select("*").eq("profile_id", id).maybeSingle(),
    supabase.from("salary_advances").select("id, amount_paisa, monthly_cut_paisa, given_on, reason").eq("profile_id", id).order("given_on", { ascending: false }),
    supabase.from("salary_payments").select("id, month, net_paisa, advance_cut_paisa, status, paid_on, pay_mode").eq("profile_id", id).order("month", { ascending: false }),
    supabase.from("staff_attendance").select("status").eq("profile_id", id).gte("date", since),
    supabase.from("sections").select("name, classes(name)").eq("class_teacher_id", id),
  ]);
  if (!p || !["principal", "teacher", "accountant", "owner"].includes(p.role)) notFound();
  const adv = advanceState((advances ?? []) as never, (salaries ?? []).reduce((t, s) => t + Number(s.advance_cut_paisa), 0));
  const count = (st: string) => (att ?? []).filter((a) => a.status === st).length;
  const classOf = ((sections ?? []) as unknown as { name: string; classes: { name: string } }[]).map((s) => `${s.classes.name}-${s.name}`).join(", ");
  const missing = [!d?.cnic && "CNIC", !d?.date_of_birth && "date of birth", !d?.qualification && "qualification", !d?.joining_date && "joining date",
    !Number(d?.basic_salary_paisa) && "salary", d?.pay_mode === "bank" && !d?.account_no && "bank account"].filter(Boolean) as string[];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={admin ? "/principal/staff" : "/principal/staff/salaries"} className="eyebrow">‹ {admin ? "All staff" : "Salaries"}</Link>
          <h1 className="h1">{p.full_name}</h1>
          <p className="muted text-base">{d?.designation || ROLE[p.role]}{classOf ? ` · class teacher of ${classOf}` : ""}{p.is_active ? "" : " · not working here now"}</p>
        </div>
        {admin && <StaffTabs current="staff" />}
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved === "new" && <div className="notice-ok">Added. Now fill the record below.</div>}
      {sp.saved && sp.saved !== "new" && <div className="notice-ok">Saved.</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tile"><span className="muted">This month</span><b>{count("absent")} absent</b><span className="muted text-xs">{count("late")} late · {count("leave")} leave</span></div>
        <div className="tile"><span className="muted">Salary</span><b>{rupees(Number(d?.basic_salary_paisa ?? 0) + Number(d?.allowance_paisa ?? 0))}</b><span className="muted text-xs">{d ? PAY_MODE[d.pay_mode] : "not set"}</span></div>
        <div className="tile"><span className="muted">Advance still owed</span><b>{rupees(adv.owed)}</b><span className="muted text-xs">{adv.dueNow ? `${rupees(adv.dueNow)} cut next salary` : "nothing to cut"}</span></div>
        <div className="tile"><span className="muted">Record</span><b>{missing.length ? `${missing.length} missing` : "Complete"}</b><span className="muted text-xs">{missing.join(", ") || "all filled"}</span></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <div className="flex flex-col gap-5">
          <section className="card">
            <h2 className="h2">Photo</h2>
            <PhotoUpload kind="staff" id={id} campusId={me.campus_id} name={p.full_name} url={p.avatar_url} />
          </section>
          {admin && (
            <form action={saveStaffBasic} className="card">
              <h2 className="h2">Basic</h2>
              <input type="hidden" name="profile_id" value={id} />
              <label className="field">Full name<input className="input" name="full_name" required defaultValue={p.full_name} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field">Mobile<input className="input" name="phone" inputMode="tel" defaultValue={p.phone ?? ""} /></label>
                <label className="field">Email for login<input className="input" name="email" type="email" defaultValue={p.email ?? ""} /></label>
              </div>
              {p.role !== "principal" && p.role !== "owner" && (
                <label className="field">Role<select className="input" name="role" defaultValue={p.role}><option value="teacher">Teacher</option><option value="accountant">Accountant</option></select></label>
              )}
              <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="is_active" defaultChecked={p.is_active} className="h-5 w-5" /> Working here now</label>
              <p className="muted">{p.user_id ? "Can log in." : "No login yet."}</p>
              <button className="btn self-start" type="submit">Save</button>
            </form>
          )}
          <form action={saveStaffDetails} className="card">
            <h2 className="h2">Personal</h2>
            <input type="hidden" name="profile_id" value={id} />
            <div className="grid grid-cols-2 gap-3">
              <label className="field">Designation<input className="input" name="designation" defaultValue={d?.designation ?? ""} placeholder="Senior Science Teacher" /></label>
              <label className="field">CNIC<input className="input" name="cnic" defaultValue={d?.cnic ?? ""} placeholder="35202-1234567-1" /></label>
              <label className="field">Date of birth<input className="input" type="date" name="date_of_birth" defaultValue={d?.date_of_birth ?? ""} /></label>
              <label className="field">Gender<select className="input" name="gender" defaultValue={d?.gender ?? ""}><option value="">Not set</option><option value="male">Male</option><option value="female">Female</option></select></label>
              <label className="field">Father / husband name<input className="input" name="father_or_husband" defaultValue={d?.father_or_husband ?? ""} /></label>
              <label className="field">Marital status<select className="input" name="marital_status" defaultValue={d?.marital_status ?? ""}><option value="">Not set</option><option value="single">Single</option><option value="married">Married</option><option value="widowed">Widowed</option></select></label>
              <label className="field">Joining date<input className="input" type="date" name="joining_date" defaultValue={d?.joining_date ?? ""} /></label>
              <label className="field">Emergency contact<input className="input" name="emergency_phone" inputMode="tel" defaultValue={d?.emergency_phone ?? ""} /></label>
            </div>
            <label className="field">Address<input className="input" name="address" defaultValue={d?.address ?? ""} /></label>
            <button className="btn self-start" type="submit">Save personal</button>
          </form>
          <form action={saveStaffDetails} className="card">
            <h2 className="h2">Education and experience</h2>
            <input type="hidden" name="profile_id" value={id} />
            <label className="field">Highest qualification<input className="input" name="qualification" defaultValue={d?.qualification ?? ""} placeholder="M.Sc Mathematics, B.Ed" /></label>
            <label className="field">Education (one degree per line)
              <textarea className="input min-h-24 py-3" name="education" defaultValue={d?.education ?? ""} placeholder={"Matric, BISE Lahore, 2010, 850/1050\nB.Sc, University of the Punjab, 2016, 3.2 CGPA"} />
            </label>
            <label className="field">Previous schools (one per line)
              <textarea className="input min-h-24 py-3" name="experience" defaultValue={d?.experience ?? ""} placeholder={"City School Gulberg, Science teacher, 2016 to 2020"} />
            </label>
            <button className="btn self-start" type="submit">Save education</button>
          </form>
        </div>

        <div className="flex flex-col gap-5">
          <form action={saveStaffDetails} className="card">
            <h2 className="h2">Salary and bank</h2>
            <input type="hidden" name="profile_id" value={id} />
            <div className="grid grid-cols-2 gap-3">
              <label className="field">Basic salary (Rs)<input className="input" name="basic_salary" inputMode="numeric" defaultValue={rs(d?.basic_salary_paisa)} /></label>
              <label className="field">Allowances (Rs)<input className="input" name="allowance" inputMode="numeric" defaultValue={rs(d?.allowance_paisa)} placeholder="Transport, house rent" /></label>
            </div>
            <label className="field">Paid by<select className="input" name="pay_mode" defaultValue={d?.pay_mode ?? "bank"}>{Object.entries(PAY_MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">Bank<input className="input" name="bank_name" defaultValue={d?.bank_name ?? ""} placeholder="Meezan Bank" /></label>
              <label className="field">Account title<input className="input" name="account_title" defaultValue={d?.account_title ?? ""} /></label>
              <label className="field">Account no / IBAN<input className="input" name="account_no" defaultValue={d?.account_no ?? ""} placeholder="PK36MEZN0001234567890123" /></label>
              <label className="field">JazzCash / Easypaisa no<input className="input" name="wallet_no" inputMode="tel" defaultValue={d?.wallet_no ?? ""} /></label>
            </div>
            <button className="btn self-start" type="submit">Save salary</button>
            <p className="muted">Only the principal, owner and accounts office see salary and bank details. The person sees their own.</p>
          </form>

          <section className="card">
            <h2 className="h2">Advances</h2>
            {(advances ?? []).length === 0 && <p className="muted">No advance taken.</p>}
            {adv.rows.map((a) => (
              <div key={a.id} className="flex justify-between gap-2 text-sm font-bold">
                <span>{shortDate(a.given_on)} · {rupees(Number(a.amount_paisa))}{a.monthly_cut_paisa ? ` · ${rupees(Number(a.monthly_cut_paisa))} a month` : ""}</span>
                <span className={a.left ? "" : "muted"}>{a.left ? `${rupees(a.left)} left` : "paid back"}</span>
              </div>
            ))}
            <form action={giveAdvance} className="flex flex-col gap-3">
              <input type="hidden" name="profile_id" value={id} />
              <div className="grid grid-cols-3 gap-3">
                <label className="field">Amount (Rs)<input className="input" name="amount" inputMode="numeric" required /></label>
                <label className="field">Cut each month<input className="input" name="monthly_cut" inputMode="numeric" placeholder="All next month" /></label>
                <label className="field">Given on<input className="input" type="date" name="given_on" defaultValue={todayPK()} /></label>
              </div>
              <label className="field">Reason<input className="input" name="reason" placeholder="Medical, wedding" /></label>
              <button className="btn-ghost self-start" type="submit">Give advance</button>
            </form>
          </section>

          <section className="card">
            <div className="flex items-baseline justify-between"><h2 className="h2">Salaries</h2><Link href="/principal/staff/salaries" className="eyebrow">Salary sheet</Link></div>
            {(salaries ?? []).length === 0 && <p className="muted">No salary made yet.</p>}
            {(salaries ?? []).slice(0, 12).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-sm font-bold">
                <span>{new Date(s.month + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
                <span className="flex items-center gap-2">{rupees(Number(s.net_paisa))}
                  <span className={`pill ${s.status === "paid" ? "pill-green" : "pill-orange"}`}>{s.status === "paid" ? `paid${s.paid_on ? ` ${shortDate(s.paid_on)}` : ""}` : "due"}</span>
                  <Link href={`/print/payslip/${s.id}`} target="_blank" className="underline">payslip</Link>
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
