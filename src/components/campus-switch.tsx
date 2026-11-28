"use client";

import { switchCampus } from "@/app/(app)/mode-actions";

// Principal who is also the owner: pick which campus to run. Changing it switches at once.
export function CampusSwitch({ campuses, current }: { campuses: { id: string; name: string }[]; current: string }) {
  if (campuses.length < 2) return null;
  return (
    <form action={switchCampus}>
      <select name="campus" defaultValue={current} aria-label="Campus" onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="max-w-[170px] cursor-pointer rounded-full border-2 border-[#0369a1] bg-white px-2.5 py-1 text-[12px] font-extrabold text-[#0369a1]">
        {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </form>
  );
}
