"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

export async function sendFeedback(f: FormData) {
  await requireRole("parent", "student", "teacher", "accountant");
  const sb = await createClient();
  const { error } = await sb.from("feedback").insert({
    kind: String(f.get("kind") ?? "complaint"), topic: String(f.get("topic") ?? "other"),
    body: String(f.get("body") ?? "").trim(), anonymous: f.get("anonymous") === "on",
  });
  revalidatePath("/feedback");
  redirect(error ? `/feedback?error=${encodeURIComponent(error.message)}` : "/feedback?saved=1");
}
