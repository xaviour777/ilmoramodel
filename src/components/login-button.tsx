"use client";

import { useActionState } from "react";
import { showLogin, type LoginState } from "@/lib/temp-password";

// "Create login" / "Reset password" for one person. The new password appears here once
// and is gone on reload; nothing stores it.
export function LoginButton({ action, fields, name, hasLogin }: {
  action: (prev: LoginState, f: FormData) => Promise<LoginState>;
  fields: Record<string, string>; name: string; hasLogin: boolean;
}) {
  const [state, run, pending] = useActionState<LoginState, FormData>(action, null);
  if (state?.ok) {
    return (
      <div className="rounded-[12px] border-2 border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-[13px]" role="status">
        <div className="font-black">Tell {state.name || name}:</div>
        <div>Sign in with <b className="font-mono">{showLogin(state.login ?? "")}</b></div>
        <div>Password <b className="font-mono text-[15px]">{state.password}</b></div>
        <div className="muted text-[12px]">Shown only now. They can change it in My profile.</div>
      </div>
    );
  }
  return (
    <form action={run} className="flex flex-col items-start gap-1">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="name" value={name} />
      <button className="btn-ghost" style={{ minHeight: 36, padding: "0 12px", fontSize: 12 }} type="submit" disabled={pending}>
        {pending ? "Working…" : hasLogin ? "Reset password" : "Create login"}
      </button>
      {state?.error && <span className="text-[12px] font-bold text-[#b91c1c]">{state.error}</span>}
    </form>
  );
}
