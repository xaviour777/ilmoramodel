import type { MetadataRoute } from "next";
import { getSite } from "@/lib/site/load";

// Search engines may read the public website, never the school app behind the login.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getSite();
  if (!site || site.mode !== "live") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/portal", "/login", "/principal", "/teacher", "/parent", "/student", "/accounts", "/settings", "/print", "/super", "/api", "/site-preview"] },
    sitemap: `https://${site.domain}/sitemap.xml`,
  };
}
