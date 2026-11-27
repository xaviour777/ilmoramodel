"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";

export async function setSchoolModule(f: FormData) {
  await requireRole("principal", "owner");
  const sb = await createClient();
  const { error } = await sb.rpc("school_set_module", { p_module: String(f.get("module") ?? ""), p_on: f.get("on") === "1" });
  revalidatePath("/", "layout");
  redirect(`/settings/modules?${error ? `error=${encodeURIComponent(error.message)}` : "saved=1"}`);
}
