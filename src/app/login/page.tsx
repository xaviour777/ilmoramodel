import { signIn } from "./actions";

const demo = [
  ["Principal", "principal@demo.ilmora.pk"],
  ["Teacher", "teacher@demo.ilmora.pk"],
  ["Accountant", "accounts@demo.ilmora.pk"],
  ["Parent", "parent@demo.ilmora.pk"],
  ["Student", "student@demo.ilmora.pk"],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <div className="text-5xl font-black tracking-tight" style={{ color: "var(--green)" }}>ilmora</div>
        <p className="muted mt-2 text-base">Sign in to your school</p>
      </div>
      <form action={signIn} className="card">
        {error && (
          <div className="notice-bad">
            {error === "no-profile" ? "This login isn't linked to anyone at a school yet." : error}
          </div>
        )}
        <label className="field">Email
          <input className="input" name="email" type="email" required autoComplete="email" />
        </label>
        <label className="field">Password
          <input className="input" name="password" type="password" required autoComplete="current-password" />
        </label>
        <button className="btn" type="submit">Sign in</button>
      </form>
      <div className="card">
        <div className="eyebrow">Demo logins · password Ilmora@2026</div>
        <ul className="flex flex-col gap-1.5 text-sm font-bold">
          {demo.map(([role, email]) => (
            <li key={email} className="flex justify-between gap-3"><span>{role}</span><span className="muted">{email}</span></li>
          ))}
        </ul>
      </div>
    </main>
  );
}
