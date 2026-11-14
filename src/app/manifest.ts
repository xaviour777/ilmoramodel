import type { MetadataRoute } from "next";

// Lets Android (and desktop Chrome) install Ilmora as an app on the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ilmora School",
    short_name: "Ilmora",
    description: "School management for Pakistani schools",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3fcf9",
    theme_color: "#103d37",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today", url: "/principal", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Fee desk", url: "/accounts", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Students", url: "/principal/students", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
