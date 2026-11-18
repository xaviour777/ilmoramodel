"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (path: string, error?: string, ok?: string): never => {
  const sep = path.includes("?") ? "&" : "?";
  if (error) redirect(`${path}${sep}error=${encodeURIComponent(error)}`);
  revalidatePath("/principal/exams");
  redirect(`${path}${ok ? `${sep}saved=${ok}` : ""}`);
};

export async function setInvigilator(f: FormData) {
  await requireRole("principal", "owner");
  const supabase = await createClient();
  const { error } = await supabase.from("exam_papers").update({ invigilator_id: str(f, "invigilator_id") || null }).eq("id", str(f, "paper_id"));
  back(str(f, "back") || "/principal/exams?tab=day", error?.message, "1");
}

export async function saveBoardResult(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const n = (k: string) => Math.max(0, Math.round(Number(str(f, k)) || 0));
  const { error } = await supabase.from("board_results").upsert({
    campus_id: me.campus_id, year: n("year"), class_level: n("class_level") || 10, appeared: n("appeared"), passed: n("passed"), a_plus: n("a_plus"),
    average: str(f, "average") ? Number(str(f, "average")) : null,
  }, { onConflict: "campus_id,year,class_level" });
  back("/principal/exams?tab=gaps", error?.message, "1");
}

export async function saveBoardTarget(f: FormData) {
  const me = await requireRole("principal", "owner");
  const supabase = await createClient();
  const v = Math.round(Number(str(f, "board_target")) || 0);
  const { error } = await supabase.from("campus_settings").upsert({ campus_id: me.campus_id, board_target: v >= 1 && v <= 100 ? v : null }, { onConflict: "campus_id" });
  back(str(f, "back") || "/principal/exams?tab=board", error?.message, "1");
}
