"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { mobilePK } from "@/lib/messages";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (q: string): never => redirect(`/profile?${q}`);

export async function saveProfile(f: FormData) {
  const me = await getMe();
  const supabase = await createClient();
  const name = str(f, "full_name");
  const phone = str(f, "phone");
  if (!name) back(`error=${encodeURIComponent("Write your name.")}`);
  if (phone && !mobilePK(phone)) back(`error=${encodeURIComponent("Write the mobile number like 03001234567.")}`);
  const { error } = await supabase.from("profiles").update({ full_name: name, phone: phone || null }).eq("id", me.id);
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  back("saved=details");
}

// The photo itself is uploaded from the browser into the person's own storage folder;
// this only records its address, and only if it is in that folder.
export async function saveAvatar(url: string | null) {
  const me = await getMe();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const mine = `/storage/v1/object/public/avatars/${user!.id}/`;
  if (url && !url.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL + mine)) return { error: "That photo is not yours." };
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", me.id);
  revalidatePath("/", "layout");
  return { error: error?.message ?? null };
}

export async function changePassword(f: FormData) {
  await getMe();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // the demo logins are shared on the login page, so nobody may lock the others out
  if (user?.email?.endsWith("@demo.ilmora.pk")) back(`error=${encodeURIComponent("Demo accounts can't change their password.")}`);
  const pw = str(f, "password");
  if (pw.length < 8) back(`error=${encodeURIComponent("Use at least 8 characters.")}`);
  if (pw !== str(f, "confirm")) back(`error=${encodeURIComponent("The two passwords are not the same.")}`);
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) back(`error=${encodeURIComponent(error.message)}`);
  back("saved=password");
}
