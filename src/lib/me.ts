import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "principal" | "accountant" | "teacher" | "parent" | "student";

export type Me = {
  id: string;
  full_name: string;
  role: Role;
  campus_id: string;
  campus_name: string;
  avatar_url: string | null;
};

// The signed-in person's profile. Sends them to /login when there is none.
export async function getMe(): Promise<Me> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, campus_id, avatar_url, campuses(name)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) redirect("/login?error=no-profile");
  const campus = data.campuses as unknown as { name: string } | null;
  return {
    id: data.id,
    full_name: data.full_name,
    role: data.role as Role,
    campus_id: data.campus_id,
    campus_name: campus?.name ?? "",
    avatar_url: data.avatar_url ?? null,
  };
}

// Stops a page from rendering for the wrong role.
export async function requireRole(...roles: Role[]): Promise<Me> {
  const me = await getMe();
  if (!roles.includes(me.role)) redirect(homeFor(me.role));
  return me;
}

export function homeFor(role: Role): string {
  switch (role) {
    case "owner":
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
