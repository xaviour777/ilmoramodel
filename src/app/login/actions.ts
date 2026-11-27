"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBranding } from "@/lib/branding";

// A typed mobile number (03xx…, +92 3xx…) signs in as the phone login the super admin made
// for it (see app.phone_login in the database). Anything with an @ is an email.
function loginName(raw: string) {
  const v = raw.trim();
  if (v.includes("@")) return v;
  const d = v.replace(/\D/g, "").replace(/^0092/, "").replace(/^92(3\d{9})$/, "$1").replace(/^0(3\d{9})$/, "$1");
  return /^3\d{9}$/.test(d) ? `m92${d}@phone.prinqo.app` : v;
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.signInWithPassword({
    email: loginName(String(formData.get("email") ?? "")),
    password: String(formData.get("password") ?? "").trim(),
  });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  // the platform admin goes to the schools dashboard
  const { data: superAdmin } = await supabase.rpc("am_i_super");
  if (superAdmin === true) redirect("/super");
  const brand = await getBranding();
  if (brand) {
    const { data: p } = await supabase.from("profiles").select("campuses(school_id)").eq("user_id", auth.user!.id).eq("is_active", true).limit(1).maybeSingle();
    if ((p?.campuses as unknown as { school_id: string } | null)?.school_id !== brand.id) {
      await supabase.auth.signOut();
      redirect("/login?error=wrong-school");
    }
  }
  redirect("/portal");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
