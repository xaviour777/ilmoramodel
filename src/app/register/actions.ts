"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { schoolDomain } from "@/lib/branding";

export type SignupResult = { ok?: boolean; error?: string } | null;

const MSG: Record<string, string> = {
  site: "Sign-up is open on your school's own web address only.",
  campus: "Choose your campus.", class: "Choose the class.", kind: "Choose parent or student.",
  name: "Write both names (2 to 80 letters).", phone: "Write a mobile number like 0300 1234567.",
  password: "The password needs at least 8 characters.", match: "The two passwords are not the same.",
  busy: "Too many tries. Please try again tomorrow or call the school office.",
};

// A parent or student asks for a login. The principal checks it and links it to the child.
// The database checks everything again (signup_request) and keeps only a hash of the password.
export async function requestSignup(_prev: SignupResult, f: FormData): Promise<SignupResult> {
  if (String(f.get("website") ?? "") !== "") return { ok: true }; // bots fill the hidden field
  const s = (k: string) => String(f.get(k) ?? "").trim();
  if (s("password") !== s("password2")) return { error: MSG.match };
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("signup_request", {
    p_domain: await schoolDomain(), p_campus: s("campus") || null, p_class: s("class") || null, p_kind: s("kind"),
    p_name: s("name").slice(0, 80), p_phone: s("phone").slice(0, 20), p_child: (s("kind") === "student" ? s("name") : s("child")).slice(0, 80),
    p_father: s("father").slice(0, 80), p_note: s("note").slice(0, 400), p_password: s("password").slice(0, 72), p_ip: ip,
  });
  if (error) return { error: "Something went wrong. Please try again." };
  const r = data as { ok?: boolean; error?: string } | null;
  return r?.ok ? { ok: true } : { error: MSG[r?.error ?? ""] ?? "Something went wrong. Please try again." };
}
