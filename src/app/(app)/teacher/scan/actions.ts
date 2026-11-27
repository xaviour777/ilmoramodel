"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";
import { todayPK } from "@/lib/format";

// One scan of a student card: the QR holds "admission no|name". Marks today present or late.
export async function markByCard(code: string, status: "present" | "late") {
  const me = await requireRole("teacher", "principal", "owner");
  const sb = await createClient();
  const adm = code.split("|")[0].trim();
  if (!adm) return { error: "Empty code." };
  const { data: st } = await sb.from("students").select("id, full_name, section_id, status").eq("admission_no", adm).maybeSingle();
  if (!st || st.status !== "enrolled" || !st.section_id) return { error: `No student with ID ${adm}.` };
  const { error } = await sb.from("attendance").upsert({ campus_id: me.campus_id, section_id: st.section_id, student_id: st.id, date: todayPK(), status, marked_by: me.id, marked_at: new Date().toISOString() }, { onConflict: "student_id,date" });
  if (error) return { error: error.message.includes("row-level") ? `${st.full_name} is not in your class.` : error.message };
  return { name: st.full_name };
}
