"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Owner who is also the principal: switch the menu between Principal and Director mode.
export async function switchMode(f: FormData) {
  const me = await getMe();
  const director = f.get("to") === "director";
  if (!me.combined) redirect(director ? "/principal" : "/");
  (await cookies()).set("prinqo_mode", director ? "director" : "principal", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect(director ? "/owner" : "/principal");
}

// Same person: run another campus of the school as its principal.
export async function switchCampus(f: FormData) {
  const me = await getMe();
  const campus = String(f.get("campus") ?? "");
  if (!me.combined || !campus || campus === me.campus_id) redirect("/principal");
  const supabase = await createClient();
  await supabase.rpc("switch_my_campus", { p_campus: campus });
  revalidatePath("/", "layout");
  redirect("/principal");
}
