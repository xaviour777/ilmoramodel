"use client";

import { useActionState } from "react";
import { resetLogin, type ResetState } from "../../actions";

// One person's reset button. The new password appears here once and is gone on reload.
export function ResetLogin({ schoolId, profileId, name, hasLogin }: { schoolId: string; profileId: string; name: string; hasLogin: boolean }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetLogin, null);
  if (state?.ok) {
    const phone = state.login?.match(/^m92(\d{10})@phone\.prinqo\.app$/);
    return (
      <div className="rounded-[12px] border-2 border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-[13px]" role="status">
        <div className="font-black">Tell {state.name}:</div>
        <div>Sign in with <b className="font-mono">{phone ? `0${phone[1]}` : state.login}</b></div>
        <div>Password <b className="font-mono text-[15px]">{state.password}</b></div>
        <div className="muted text-[12px]">Shown only now. Ask them to change it in My profile.</div>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="school_id" value={schoolId} /><input type="hidden" name="profile_id" value={profileId} /><input type="hidden" name="name" value={name} />
      <button className="btn-ghost" style={{ minHeight: 36, padding: "0 12px", fontSize: 12 }} type="submit" disabled={pending}>
        {pending ? "Working…" : hasLogin ? "Reset password" : "Create login"}
      </button>
      {state?.error && <span className="text-[12px] font-bold text-[#b91c1c]">{state.error}</span>}
    </form>
  );
}
