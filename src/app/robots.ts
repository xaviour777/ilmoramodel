import type { MetadataRoute } from "next";

// The school app lives behind a login; search engines have nothing to read here.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
