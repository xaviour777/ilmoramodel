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

// Health score 0–100 from what the school actually does in the app.
// Attendance marking (40) + fee collection in the app (20) + paying Prinqo on time (20)
// + someone signed in this week (10) + messages or AI used this month (10).
export type HealthIn = { status: string; attendance_days_30?: number; payments_month?: number; overdue?: number; people_7d?: number; extras_month?: number };
export function healthOf(s: HealthIn) {
  const score = Math.round(
    Math.min(1, (s.attendance_days_30 ?? 0) / 20) * 40 +
    ((s.payments_month ?? 0) > 0 ? 20 : 0) +
    ((s.overdue ?? 0) > 0 ? 0 : 20) +
    ((s.people_7d ?? 0) > 0 ? 10 : 0) +
    ((s.extras_month ?? 0) > 0 ? 10 : 0));
  return { score, tone: score >= 75 ? "g" : score >= 60 ? "y" : "r" };
}

export type Plan = { id: string; name: string; price_paisa: number; max_students: number | null; max_campuses: number | null; features: Record<string, string>; sort: number; schools: number; paying: number };

export const PLAN_FEATURES: [string, string][] = [
  ["core", "Attendance, fees, exams"],
  ["parent_app", "Parent app"],
  ["whatsapp", "WhatsApp reminders"],
  ["ai_paper", "AI paper checking"],
  ["owner", "Owner multi-campus"],
  ["domain", "Public result page and own domain"],
  ["support", "Priority support"],
];

export const PAY_METHODS: [string, string][] = [["cash", "Cash"], ["jazzcash", "JazzCash"], ["easypaisa", "Easypaisa"]];
