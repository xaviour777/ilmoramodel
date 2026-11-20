import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { translator } from "./i18n";
import { createClient } from "@/lib/supabase/server";
import { pick, withDefaults, type Lang, type SiteContent, type T } from "./content";

export type Campus = { id: string; name: string; classes: { id: string; name: string }[] };
export type Site = {
  schoolId: string;
  name: string;
  logoUrl: string | null;
  content: SiteContent;
  campuses: Campus[];
  domain: string;
  // "preview" = a signed-in staff member looking at the unpublished draft
  mode: "live" | "preview";
};

export const PREVIEW_COOKIE = "site_preview";

export const siteDomain = cache(async () => (await headers()).get("x-school-domain") ?? "");

// The website for the address this page was opened on, or null when the address has no
// published site (then the app behaves exactly as before: "/" goes to the dashboard).
export const getSite = cache(async (): Promise<Site | null> => {
  const domain = await siteDomain();
  const supabase = await createClient();
  const jar = await cookies();

  if (jar.get(PREVIEW_COOKIE)?.value === "1") {
    // row-level security only returns the signed-in staff member's own school
    const { data: row } = await supabase.from("school_sites").select("school_id, draft, domains, schools(name, logo_url)").maybeSingle();
    if (row) {
      const school = row.schools as unknown as { name: string; logo_url: string | null } | null;
      const { data: campuses } = await supabase.from("campuses").select("id, name, classes(id, name, sort)").order("created_at");
      return {
        schoolId: row.school_id,
        name: school?.name ?? "",
        logoUrl: school?.logo_url ?? null,
        content: withDefaults(row.draft),
        campuses: (campuses ?? []).map((c) => ({
          id: c.id, name: c.name,
          classes: ((c.classes ?? []) as { id: string; name: string; sort: number }[]).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map(({ id, name }) => ({ id, name })),
        })),
        domain: (row.domains as string[])[0] ?? domain,
        mode: "preview",
      };
    }
  }

  if (!domain) return null;
  const { data } = await supabase.rpc("school_site", { p_domain: domain });
  if (!data) return null;
  const d = data as { school_id: string; name: string; logo_url: string | null; content: unknown; campuses: Campus[] };
  return { schoolId: d.school_id, name: d.name, logoUrl: d.logo_url, content: withDefaults(d.content), campuses: d.campuses ?? [], domain, mode: "live" };
});

// The visitor's language: the same "lang" cookie the family screens use.
export const getLang = cache(async (): Promise<Lang> => ((await cookies()).get("lang")?.value === "ur" ? "ur" : "en"));

// For the inner website pages: the site, language and words, or a 404 on an address with no website.
export async function requireSite() {
  const site = await getSite();
  if (!site) notFound();
  const lang = await getLang();
  return { site, lang, t: translator(lang), c: site.content, preview: site.mode === "preview" };
}

export async function pageMeta(title: T, description?: T) {
  const site = await getSite();
  if (!site) return {};
  const lang = await getLang();
  return {
    title: { absolute: `${lang === "ur" ? title.ur : title.en} · ${site.name}` },
    description: description ? pick(description, lang) : pick(site.content.seo.description, lang),
  };
}
