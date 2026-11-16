import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// The school for the domain this page was opened on (set by middleware).
// On a domain that isn't any school's (the vercel.app address, localhost)
// it is null and the app shows the plain Ilmora look.
export type Branding = { id: string; name: string; logo_url: string | null; primary_color: string | null; support_email: string | null };

export const DEFAULT_COLOR = "#16a34a";

export const schoolDomain = cache(async () => (await headers()).get("x-school-domain") ?? "");

export const getBranding = cache(async (): Promise<Branding | null> => {
  const domain = await schoolDomain();
  if (!domain) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("school_branding", { p_domain: domain });
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Branding | undefined) ?? null;
});

// A darker shade of the brand colour, for the flat shadow under buttons and tiles.
export function shade(hex: string, by = 0.18) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - by))).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
