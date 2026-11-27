import type { MetadataRoute } from "next";
import { getBranding } from "@/lib/branding";

// Lets parents, students and staff add the app to their phone's home screen.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await getBranding();
  return {
    name: b?.name ?? "Prinqo AI", short_name: (b?.name ?? "Prinqo AI").slice(0, 12),
    start_url: "/", display: "standalone", background_color: "#ffffff", theme_color: b?.primary_color ?? "#16a34a",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
  };
}
