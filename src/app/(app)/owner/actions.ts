"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { pushTo } from "@/lib/push";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => (str(f, k) === "" ? null : Number(str(f, k)));
const back = (f: FormData, error?: string): never => {
  revalidatePath("/owner", "layout");
  const to = str(f, "back") || "/owner";
  redirect(to + (to.includes("?") ? "&" : "?") + (error ? `error=${encodeURIComponent(error)}` : "saved=1"));
};

export async function decideApproval(f: FormData) {
  const me = await requireRole("owner");
  const sb = await createClient();
  const ok = str(f, "decision") === "approve";
  const { data, error } = await sb.from("approvals").update({ status: ok ? "approved" : "declined", decided_by: me.id, decided_at: new Date().toISOString(), decision_note: str(f, "note") || null })
    .eq("id", str(f, "id")).eq("status", "pending").select("title, requested_by").maybeSingle();
  if (!error && data?.requested_by) await pushTo({ profiles: [data.requested_by] }, { title: ok ? "Approved by the owner" : "Declined by the owner", body: data.title, url: "/principal/approvals" });
  back(f, error?.message ?? (data ? undefined : "Already decided."));
}

export async function askApproval(f: FormData) {
  await requireRole("owner", "principal", "accountant");
  const sb = await createClient();
  const amt = num(f, "amount");
  const { error } = await sb.from("approvals").insert({
    campus_id: str(f, "campus_id") || null, kind: str(f, "kind"), title: str(f, "title"), detail: str(f, "detail") || null,
    amount_paisa: amt == null ? null : Math.round(amt * 100), monthly: f.get("monthly") === "on",
  });
  back(f, error?.message);
}

export async function saveCampus(f: FormData) {
  await requireRole("owner");
  const sb = await createClient();
  const row = {
    name: str(f, "name"), city: str(f, "city") || null, status: str(f, "status") || "running", opened_on: str(f, "opened_on") || null,
    seat_capacity: num(f, "seats"), admissions_target: num(f, "target"), principal_id: str(f, "principal_id") || null,
  };
  if (!row.name) back(f, "Give the campus a name.");
  const id = str(f, "id");
  if (id) { const { error } = await sb.from("campuses").update(row).eq("id", id); back(f, error?.message); }
  const { data: me } = await sb.from("profiles").select("campuses(school_id)").eq("role", "owner").limit(1).maybeSingle();
  const school = (me?.campuses as unknown as { school_id: string } | null)?.school_id;
  const { data: c, error } = await sb.from("campuses").insert({ ...row, school_id: school }).select("id").maybeSingle();
  if (!error && c) {
    await sb.from("campus_checklist").insert(["Building and furniture", "BISE affiliation", "Principal hired", "Teachers hired", "Admissions open", "Break-even"].map((item, i) => ({ campus_id: c.id, item, sort: i + 1 })));
  }
  back(f, error?.message);
}

export async function saveChecklist(f: FormData) {
  await requireRole("owner", "principal");
  const sb = await createClient();
  const { error } = await sb.from("campus_checklist").update({ status: str(f, "status"), note: str(f, "note") || null }).eq("id", str(f, "id"));
  back(f, error?.message);
}

export async function saveLimits(f: FormData) {
  await requireRole("owner");
  const sb = await createClient();
  const kinds = ["expense", "concession", "hiring", "payroll", "fee_change", "other"];
  const rows = kinds.flatMap((k) => ["principal", "accountant"].map((role) => {
    const v = num(f, `${k}:${role}`);
    return { kind: k, role, limit_paisa: v == null ? null : Math.round(v * 100), note: str(f, `${k}:${role}:note`) || null };
  }));
  const { error } = await sb.from("approval_limits").upsert(rows, { onConflict: "school_id,kind,role" });
  back(f, error?.message);
}

export async function saveGroupSettings(f: FormData) {
  await requireRole("owner");
  const sb = await createClient();
  const { error } = await sb.from("group_settings").upsert({
    late_fee_paisa: Math.round((num(f, "late_fee") ?? 0) * 100), due_day: num(f, "due_day") ?? 10,
    sibling_discount_pct: num(f, "sibling") ?? 0, max_concession_pct: num(f, "max_concession") ?? 10,
    hold_results_days: num(f, "hold_days"), ai_monthly_budget_paisa: num(f, "ai_budget") == null ? null : Math.round(num(f, "ai_budget")! * 100), updated_at: new Date().toISOString(),
  });
  back(f, error?.message);
}

export async function saveBranding(f: FormData) {
  await requireRole("owner");
  const sb = await createClient();
  const { data: c } = await sb.from("campuses").select("school_id").limit(1).maybeSingle();
  const { error } = await sb.from("schools").update({ name: str(f, "name"), primary_color: str(f, "color") || null, logo_url: str(f, "logo") || null, support_email: str(f, "email") || null }).eq("id", c?.school_id ?? "");
  back(f, error?.message);
}

export async function scheduleReport(f: FormData) {
  await requireRole("owner");
  const sb = await createClient();
  const id = str(f, "remove");
  const { error } = id ? await sb.from("report_schedules").delete().eq("id", id)
    : await sb.from("report_schedules").insert({ report: str(f, "report"), frequency: str(f, "frequency"), send_to: str(f, "send_to") || null });
  back(f, error?.message);
}
