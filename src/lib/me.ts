import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBranding } from "@/lib/branding";

export type Role = "owner" | "principal" | "accountant" | "teacher" | "parent" | "student";

export type Me = {
  id: string;
  full_name: string;
  role: Role;
  campus_id: string;
  campus_name: string;
  school_id: string | null;
  avatar_url: string | null;
  // owner, or a principal at a school where the owner is also the principal
  is_owner: boolean;
  combined: boolean;
};

// The signed-in person's profile. Sends them to /login when there is none.
export async function getMe(): Promise<Me> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, campus_id, avatar_url, campuses(name, school_id, schools(status, trial_ends_on, owner_is_principal))")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) redirect("/login?error=no-profile");
  const campus = data.campuses as unknown as { name: string; school_id: string; schools: { status: string; trial_ends_on: string | null; owner_is_principal?: boolean } | null } | null;
  // a suspended school, or one whose trial has ended, can't use the app (its data is kept)
  const sch = campus?.schools;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  if (sch?.status === "suspended") redirect("/login?error=school-suspended");
  if (sch?.status === "trial" && sch.trial_ends_on && sch.trial_ends_on < today) redirect("/login?error=trial-ended");
  // on a school's own domain, only that school's people may use the app
  const brand = await getBranding();
  if (brand && campus?.school_id !== brand.id) redirect("/login?error=wrong-school");
  return {
    id: data.id,
    full_name: data.full_name,
    role: data.role as Role,
    campus_id: data.campus_id,
    campus_name: campus?.name ?? "",
    school_id: campus?.school_id ?? null,
    avatar_url: data.avatar_url ?? null,
    is_owner: data.role === "owner" || (data.role === "principal" && !!sch?.owner_is_principal),
    combined: data.role === "principal" && !!sch?.owner_is_principal,
  };
}

// Stops a page from rendering for the wrong role.
export async function requireRole(...roles: Role[]): Promise<Me> {
  const me = await getMe();
  if (!roles.includes(me.role) && !(roles.includes("owner") && me.is_owner)) redirect(homeFor(me.role));
  return me;
}

export function homeFor(role: Role): string {
  switch (role) {
    case "owner":
      return "/owner";
    case "principal":
      return "/principal";
    case "accountant":
      return "/accounts";
    case "teacher":
      return "/teacher";
    case "parent":
      return "/parent";
    case "student":
      return "/student";
  }
}
