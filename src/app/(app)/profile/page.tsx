import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AvatarUpload } from "@/components/avatar-upload";
import { SettingsTabs } from "@/components/settings-tabs";
import { changePassword, saveProfile } from "./actions";

const ROLE: Record<string, string> = { owner: "Owner", principal: "Principal", accountant: "Accountant", teacher: "Teacher", parent: "Parent", student: "Student" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await getMe();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: p }, { data: { user } }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, avatar_url").eq("id", me.id).single(),
    supabase.auth.getUser(),
  ]);
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
      </div>
    </>
  );
}
