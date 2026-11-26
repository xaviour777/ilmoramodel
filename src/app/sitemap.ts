import type { MetadataRoute } from "next";
import { getSite } from "@/lib/site/load";

const PAGES = ["", "/about", "/leadership", "/academics", "/future-skills", "/student-life", "/achievements", "/admissions", "/admissions/enquiry", "/contact", "/privacy", "/child-safety"];

// Only a school's live website is listed; the app's own address has nothing to index.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await getSite();
  if (!site || site.mode !== "live") return [];
  return PAGES.map((p) => ({ url: `https://${site.domain}${p}`, changeFrequency: p === "" ? "weekly" : "monthly", priority: p === "" ? 1 : 0.6 }));
}
