"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { requestSignup, type SignupResult } from "./actions";

type Campus = { id: string; name: string; classes: { id: string; name: string }[] };

export function SignupForm({ campuses, color }: { campuses: Campus[]; color: string }) {
  const [state, run, pending] = useActionState<SignupResult, FormData>(requestSignup, null);
  const [kind, setKind] = useState<"parent" | "student">("parent");
  const [campus, setCampus] = useState(campuses[0]?.id ?? "");
  const classes = campuses.find((c) => c.id === campus)?.classes ?? [];

  if (state?.ok) {
    return (
      <div className="card flex flex-col gap-3 text-center" role="status">
        <div className="text-4xl">✅</div>
        <h2 className="h2">Request sent</h2>
        <p className="muted">The principal will check it and link it to your child, usually within one or two working days. Then sign in with your mobile number and the password you chose.</p>
        <Link href="/login" className="btn self-center" style={{ background: color }}>Go to sign in</Link>
      </div>
    );
  }
  return (
    <form action={run} className="card flex flex-col gap-3">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-black">I am</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["parent", "student"] as const).map((k) => (
            <label key={k} className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-3 font-black"
              style={kind === k ? { borderColor: color, color } : { borderColor: "var(--line)" }}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "parent" ? "A parent" : "A student"}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">{kind === "parent" ? "Your name" : "Your full name"}<input className="input" name="name" required minLength={2} maxLength={80} autoComplete="name" /></label>
      <label className="field">{kind === "parent" ? "Your mobile number" : "Mobile number (yours or a parent's)"}
        <input className="input" name="phone" required inputMode="tel" placeholder="0300 1234567" autoComplete="tel" /></label>
      {kind === "parent"
        ? <label className="field">Child&apos;s name<input className="input" name="child" required minLength={2} maxLength={80} /></label>
        : <p className="muted -mt-1 text-[13px]">The principal will find you in your class by your name.</p>}
      <label className="field">Father&apos;s name<input className="input" name="father" maxLength={80} /></label>
      {campuses.length > 1 && (
        <label className="field">Campus<select className="input" name="campus" value={campus} onChange={(e) => setCampus(e.target.value)}>
          {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      )}
      {campuses.length <= 1 && <input type="hidden" name="campus" value={campus} />}
      <label className="field">Class<select className="input" name="class" required defaultValue="">
        <option value="" disabled>Choose</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="field">Roll number or anything else (optional)<input className="input" name="note" maxLength={400} placeholder="Roll no. 12, section B" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">Choose a password<input className="input" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></label>
        <label className="field">Password again<input className="input" name="password2" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></label>
      </div>
      {state?.error && <div className="notice-bad">{state.error}</div>}
      <button className="btn" type="submit" disabled={pending} style={{ background: color }}>{pending ? "Sending…" : "Send request"}</button>
      <p className="muted text-center text-sm">Already approved? <Link href="/login" className="underline">Sign in</Link></p>
    </form>
  );
}
