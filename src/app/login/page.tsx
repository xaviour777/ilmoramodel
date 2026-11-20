import { signIn, signOut } from "./actions";
import { getBranding, DEFAULT_COLOR, shade } from "@/lib/branding";

const demo = [
  ["Owner (3 campuses)", "owner@demo.ilmora.pk"],
  ["Principal · Johar Town", "principal@demo.ilmora.pk"],
  ["Principal · Model Town", "principal.mt@demo.ilmora.pk"],
  ["Teacher", "teacher@demo.ilmora.pk"],
  ["Accountant", "accounts@demo.ilmora.pk"],
  ["Parent", "parent@demo.ilmora.pk"],
  ["Student", "student@demo.ilmora.pk"],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const brand = await getBranding();
  const color = brand?.primary_color ?? DEFAULT_COLOR;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center text-center">
        {brand?.logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={brand.logo_url} alt={brand.name} className="mb-3 h-20 w-20 rounded-[20px] object-contain" />
          : brand && <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-[20px] text-4xl font-black text-white" style={{ background: color, boxShadow: `0 5px 0 ${shade(color)}` }}>{brand.name[0]}</div>}
        <div className="text-5xl font-black tracking-tight" style={{ color }}>{brand?.name ?? "ilmora"}</div>
        <p className="muted mt-2 text-base">{brand ? "Sign in to continue" : "Sign in to your school"}</p>
      </div>
      <form action={signIn} className="card">
        {error && (
          <div className="notice-bad">
            {error === "no-profile" ? "This login isn't linked to anyone at a school yet."
              : error === "trial-ended" ? `Your school's free trial has ended. Your data is safe; contact Ilmora${brand?.support_email ? ` or ${brand.support_email}` : ""} to continue.`
              : error === "school-suspended" ? "Your school's account is paused. Your data is safe; contact Ilmora to turn it back on."
              : error === "wrong-school" ? `This login belongs to another school. Use your own school's address${brand ? `, not ${brand.name}'s` : ""}.` : error}
          </div>
        )}
        <label className="field">Email (drivers: mobile number)
          <input className="input" name="email" type="text" inputMode="email" required autoComplete="username" />
        </label>
        <label className="field">Password
          <input className="input" name="password" type="password" required autoComplete="current-password" />
        </label>
        <button className="btn" type="submit" style={brand ? { background: color, boxShadow: `0 4px 0 ${shade(color)}` } : undefined}>Sign in</button>
        {["wrong-school", "trial-ended", "school-suspended"].includes(error ?? "") && <button formAction={signOut} formNoValidate className="muted text-sm underline" type="submit">Sign out of the other school</button>}
      </form>
      {brand ? (
        brand.support_email && <p className="muted text-center text-sm">Trouble signing in? Write to <a className="underline" href={`mailto:${brand.support_email}`}>{brand.support_email}</a></p>
      ) : (
        <div className="card">
          <div className="eyebrow">Demo logins · tap one to sign in</div>
          <p className="muted text-sm">Password for all: <code className="rounded bg-[#f1f5f9] px-1.5 py-0.5 font-black text-[#1f2937]">Ilmora@2026</code> (capital I, small lmora)</p>
          <ul className="flex flex-col gap-1.5 text-sm font-bold">
            {demo.map(([role, email]) => (
              <li key={email}>
                <form action={signIn}>
                  <input type="hidden" name="email" value={email} /><input type="hidden" name="password" value="Ilmora@2026" />
                  <button type="submit" className="flex w-full justify-between gap-3 rounded-xl border-2 px-3 py-2 text-left hover:bg-[#f0f9ff]" style={{ borderColor: "#e5e7eb" }}><span>{role}</span><span className="muted">{email}</span></button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
