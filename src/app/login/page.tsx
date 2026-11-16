import { signIn, signOut } from "./actions";
import { getBranding, DEFAULT_COLOR, shade } from "@/lib/branding";

const demo = [
  ["Principal", "principal@demo.ilmora.pk"],
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
              : error === "wrong-school" ? `This login belongs to another school. Use your own school's address${brand ? `, not ${brand.name}'s` : ""}.` : error}
          </div>
        )}
        <label className="field">Email
          <input className="input" name="email" type="email" required autoComplete="email" />
        </label>
        <label className="field">Password
          <input className="input" name="password" type="password" required autoComplete="current-password" />
        </label>
        <button className="btn" type="submit" style={brand ? { background: color, boxShadow: `0 4px 0 ${shade(color)}` } : undefined}>Sign in</button>
        {error === "wrong-school" && <button formAction={signOut} formNoValidate className="muted text-sm underline" type="submit">Sign out of the other school</button>}
      </form>
      {brand ? (
        brand.support_email && <p className="muted text-center text-sm">Trouble signing in? Write to <a className="underline" href={`mailto:${brand.support_email}`}>{brand.support_email}</a></p>
      ) : (
        <div className="card">
          <div className="eyebrow">Demo logins · password Ilmora@2026</div>
          <ul className="flex flex-col gap-1.5 text-sm font-bold">
            {demo.map(([role, email]) => (
              <li key={email} className="flex justify-between gap-3"><span>{role}</span><span className="muted">{email}</span></li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
