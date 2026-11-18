import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/pwa";
import { Nunito } from "next/font/google";
import "./globals.css";
import { getBranding, shade } from "@/lib/branding";

const nunito = Nunito({ subsets: ["latin"], weight: ["600", "700", "800", "900"], variable: "--font-nunito", display: "swap" });

// The tab title and icon follow the school whose domain was opened.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBranding();
  return {
    title: brand?.name ?? "Ilmora",
    description: brand ? `${brand.name} · school app` : "School management for Pakistani schools",
    applicationName: brand?.name ?? "Ilmora",
    appleWebApp: { capable: true, title: brand?.name ?? "Ilmora", statusBarStyle: "default" },
    icons: { apple: "/icons/apple-touch-icon.png", ...(brand?.logo_url ? { icon: brand.logo_url } : {}) },
  };
}

export const viewport: Viewport = { themeColor: "#16a34a" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const brand = await getBranding();
  const c = brand?.primary_color;
  // the school's colour replaces Ilmora green on buttons, logo tiles and links
  const theme = c ? { ["--brand" as string]: c, ["--brand-lip" as string]: shade(c) } : undefined;
  return (
    <html lang="en" className={nunito.variable} style={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@500&display=swap"
        />
      </head>
      <body className={`${nunito.className} antialiased`}>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
