import type { createClient } from "@/lib/supabase/server";
import { todayPK } from "@/lib/format";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// <campus initials>-<YYMM>, e.g. "MSG-2611"; the running number goes after it.
export function challanTag(campusName: string, month: string) {
  const prefix = campusName.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/campus/i.test(w)).map((w) => w[0]!.toUpperCase()).join("").slice(0, 3) || "CH";
  return `${prefix}-${month.slice(2, 4)}${month.slice(5, 7)}`;
}

// A newly admitted child's first challan: this month's fee for their class plus the once-only heads
// (admission fee, annual fund). If the family already has this month's challan, the lines are added to it.
export async function firstChallan(supabase: Supabase, me: { campus_id: string; campus_name: string },
  p: { familyId: string; studentId: string; studentName: string; sectionId: string }) {
  const today = todayPK();
  const month = today.slice(0, 7);
  const billing = `${month}-01`;
  const [{ data: sec }, { data: heads }, { data: existing }] = await Promise.all([
    supabase.from("sections").select("class_id").eq("id", p.sectionId).single(),
    supabase.from("fee_heads").select("id, name"),
    supabase.from("invoices").select("id, family_id, challan_no").eq("billing_month", billing),
  ]);
  const { data: structures } = await supabase.from("fee_structures").select("fee_head_id, amount_paisa").eq("class_id", sec?.class_id ?? "");
  if (!structures?.length) return { error: "No fee is set for this class yet (Fees → Fees and challans), so no challan was made." };
  let invoiceId = (existing ?? []).find((e) => e.family_id === p.familyId)?.id;
  if (!invoiceId) {
    const n = (existing ?? []).reduce((m, e) => Math.max(m, Number(e.challan_no.split("-").pop()) || 0), 0) + 1;
    const due = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
    const { data: inv, error } = await supabase.from("invoices").insert({
      campus_id: me.campus_id, family_id: p.familyId, billing_month: billing, due_on: due,
      challan_no: `${challanTag(me.campus_name, month)}-${String(n).padStart(4, "0")}`,
    }).select("id").single();
    if (error || !inv) return { error: error?.message ?? "Could not make the challan." };
    invoiceId = inv.id;
  }
  const name = new Map((heads ?? []).map((h) => [h.id, h.name]));
  const { error } = await supabase.from("invoice_lines").insert(structures.map((s) => ({
    campus_id: me.campus_id, invoice_id: invoiceId, student_id: p.studentId, fee_head_id: s.fee_head_id,
    description: `${name.get(s.fee_head_id)}, ${p.studentName}`, amount_paisa: Number(s.amount_paisa),
  })));
  return { error: error?.message, invoiceId };
}
