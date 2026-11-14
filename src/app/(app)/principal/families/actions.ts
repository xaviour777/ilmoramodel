"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/me";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// Records which family brought this one, found by that family's phone number. An empty phone clears it.
export async function setReferrer(f: FormData) {
  await requireRole("principal", "owner", "accountant");
  const supabase = await createClient();
  const id = str(f, "family_id");
  const phone = str(f, "phone").replace(/[^\d]/g, "");
  const back = (q: string) => redirect(`/principal/families/${id}?${q}`);
  let referrer: string | null = null;
  if (phone) {
    const { data } = await supabase.from("families").select("id")
      .or(`phone.eq.${phone},reminder_phone.eq.${phone}`).neq("id", id).limit(2);
    if (!data?.length) back(`error=${encodeURIComponent("No family has this phone number.")}`);
    if (data!.length > 1) back(`error=${encodeURIComponent("Two families share this number. Ask the office to fix it first.")}`);
    referrer = data![0].id;
  }
  const { error } = await supabase.from("families").update({ referred_by_family_id: referrer }).eq("id", id);
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/principal/families/${id}`);
  back("saved=1");
}
