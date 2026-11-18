import type { SupabaseClient } from "@supabase/supabase-js";
import { rupees, todayPK } from "@/lib/format";

// The principal's morning brief: one short message with what needs attention today.
// Works with the signed-in client (RLS) or, for the cron, a service client scoped by campus.
export async function buildBrief(sb: SupabaseClient, campusId: string, schoolName: string) {
  const today = todayPK();
  const y = new Date(Date.parse(today) - 864e5).toISOString().slice(0, 10);
  const c = (q: { count: number | null }) => q.count ?? 0;
  const [att, pays, leave, staffLeave, fb, adm, due, exam] = await Promise.all([
    sb.from("attendance").select("status").eq("campus_id", campusId).eq("date", y).limit(5000),
    sb.from("payments").select("amount_paisa").eq("campus_id", campusId).gte("received_at", y).lt("received_at", today),
    sb.from("leave_requests").select("id", { count: "exact", head: true }).eq("campus_id", campusId).eq("status", "pending"),
    sb.from("leave_requests").select("id", { count: "exact", head: true }).eq("campus_id", campusId).eq("status", "approved").lte("from_on", today).gte("to_on", today),
    sb.from("feedback").select("id", { count: "exact", head: true }).eq("campus_id", campusId).eq("status", "open"),
    sb.from("admissions").select("id", { count: "exact", head: true }).eq("campus_id", campusId).in("status", ["inquiry", "test", "offered"]),
    sb.from("homework").select("id", { count: "exact", head: true }).eq("campus_id", campusId).eq("due_on", today),
    sb.from("exams").select("name, starts_on").eq("campus_id", campusId).gte("starts_on", today).order("starts_on").limit(1).maybeSingle(),
  ]);
  const a = att.data ?? [];
  const present = a.filter((r) => r.status === "present" || r.status === "late").length;
  const fees = (pays.data ?? []).reduce((t, p) => t + Number(p.amount_paisa), 0);
  const lines = [
    `Good morning — ${schoolName}, ${today}`,
    a.length ? `Yesterday attendance: ${Math.round((present / a.length) * 100)}% (${a.length - present} absent)` : "Yesterday: no attendance marked",
    `Fees received yesterday: ${rupees(fees)}`,
    `Staff on leave today: ${c(staffLeave)} · leave requests waiting: ${c(leave)}`,
    `Open complaints: ${c(fb)} · admissions in progress: ${c(adm)}`,
    `Homework due today: ${c(due)}`,
    exam.data ? `Next exam: ${exam.data.name} on ${exam.data.starts_on}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
