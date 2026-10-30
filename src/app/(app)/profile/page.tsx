import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AvatarUpload } from "@/components/avatar-upload";
import { SettingsTabs } from "@/components/settings-tabs";
import Link from "next/link";
import { rupees, shortDate } from "@/lib/format";
import { PAY_MODE } from "@/lib/payroll";
import { changePassword, saveProfile } from "./actions";

const ROLE: Record<string, string> = { owner: "Owner", principal: "Principal", accountant: "Accountant", teacher: "Teacher", parent: "Parent", student: "Student" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await getMe();
  const sp = await searchParams;
  const supabase = await createClient();
  const staff = ["principal", "teacher", "accountant", "owner"].includes(me.role);
  const [{ data: p }, { data: { user } }, { data: d }, { data: slips }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, avatar_url").eq("id", me.id).single(),
    supabase.auth.getUser(),
    staff ? supabase.from("staff_details").select("*").eq("profile_id", me.id).maybeSingle() : Promise.resolve({ data: null }),
    staff ? supabase.from("salary_payments").select("id, month, net_paisa, status").eq("profile_id", me.id).order("month", { ascending: false }).limit(6) : Promise.resolve({ data: null }),
  ]);
  // what the office keeps about this person; they read it here and ask the office to correct it
  const record: [string, string | null | undefined][] = d ? [
    ["Designation", d.designation], ["CNIC", d.cnic], ["Date of birth", d.date_of_birth && shortDate(d.date_of_birth)],
    ["Joining date", d.joining_date && shortDate(d.joining_date)], ["Qualification", d.qualification],
    ["Salary", rupees(Number(d.basic_salary_paisa) + Number(d.allowance_paisa))], ["Paid by", PAY_MODE[d.pay_mode]],
    ["Bank account", d.account_no ? `${d.bank_name ?? ""} ${d.account_no}` : null],
  ] : [];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">My profile</h1>
          <p className="muted text-base">{ROLE[me.role]} · {me.campus_name}</p>
        </div>
        {(me.role === "principal" || me.role === "owner") && <SettingsTabs current="profile" />}
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved === "details" && <div className="notice-ok">Saved.</div>}
      {sp.saved === "password" && <div className="notice-ok">Password changed. Use the new one next time you sign in.</div>}
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <h2 className="h2">Photo and details</h2>
          <AvatarUpload name={p?.full_name ?? me.full_name} url={p?.avatar_url ?? null} />
          <form action={saveProfile} className="flex flex-col gap-3">
            <label className="field">Full name<input className="input" name="full_name" required defaultValue={p?.full_name ?? ""} /></label>
            <label className="field">Mobile number<input className="input" name="phone" inputMode="tel" defaultValue={p?.phone ?? ""} placeholder="03001234567" /></label>
            <label className="field">Email (used to sign in)<input className="input" value={user?.email ?? ""} readOnly disabled /></label>
            <button className="btn self-start" type="submit">Save</button>
          </form>
        </section>
        <form action={changePassword} className="card">
          <h2 className="h2">Change password</h2>
          <label className="field">New password<input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label className="field">New password again<input className="input" name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
          <button className="btn self-start" type="submit">Change password</button>
        </form>
        {staff && (
          <section className="card">
            <h2 className="h2">My school record</h2>
            {!d && <p className="muted">The office hasn&apos;t filled your record yet.</p>}
            {record.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-sm font-bold"><span className="muted">{k}</span><span className="text-right">{v}</span></div>
            ))}
            {d?.education && <div className="text-sm font-bold"><span className="muted">Education</span><p className="whitespace-pre-line">{d.education}</p></div>}
            {d?.experience && <div className="text-sm font-bold"><span className="muted">Previous schools</span><p className="whitespace-pre-line">{d.experience}</p></div>}
            <p className="muted">Something wrong? Ask the office to correct it.</p>
          </section>
        )}
        {staff && (slips ?? []).length > 0 && (
          <section className="card">
            <h2 className="h2">My payslips</h2>
            {(slips ?? []).map((s) => (
              <div key={s.id} className="flex justify-between gap-2 text-sm font-bold">
                <span>{new Date(s.month + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
                <span className="flex gap-2">{rupees(Number(s.net_paisa))} · {s.status === "paid" ? "paid" : "due"} · <Link href={`/print/payslip/${s.id}`} target="_blank" className="underline">payslip</Link></span>
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
