import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Is the signed-in person the platform admin (the super_admins table)?
export const isSuper = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.rpc("am_i_super");
  return data === true;
});

// Stops a /super page for anyone else.
export async function requireSuper() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isSuper())) redirect("/");
  return user;
}

export type SchoolRow = {
  id: string; name: string; city: string | null; custom_domain: string | null; logo_url: string | null; primary_color: string | null;
  support_email: string | null; status: "trial" | "active" | "suspended"; trial_ends_on: string | null; plan: string; max_students: number | null;
  notes: string | null; created_at: string; campuses: number; students: number; staff: number; last_login: string | null; principal: string | null;
};

// trial schools whose trial date has passed count as expired
export function stateOf(s: { status: string; trial_ends_on: string | null }, today: string) {
  if (s.status === "suspended") return { id: "suspended", label: "Suspended", tone: "r" };
  if (s.status === "trial") {
    if (s.trial_ends_on && s.trial_ends_on < today) return { id: "expired", label: "Trial ended", tone: "r" };
    const left = s.trial_ends_on ? Math.ceil((Date.parse(s.trial_ends_on) - Date.parse(today)) / 86400000) : null;
    return { id: "trial", label: left == null ? "Trial" : `Trial · ${left} day${left === 1 ? "" : "s"} left`, tone: "y" };
  }
  return { id: "active", label: "Active", tone: "g" };
}
