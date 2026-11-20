"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBranding } from "@/lib/branding";

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  // drivers sign in with their mobile number
  const typed = String(formData.get("email") ?? "").trim();
  const mobile = typed.replace(/[\s-]/g, "");
  const { data: auth, error } = await supabase.auth.signInWithPassword({
    email: /^03\d{9}$/.test(mobile) ? `${mobile}@phone.ilmora.pk` : typed,
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
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
