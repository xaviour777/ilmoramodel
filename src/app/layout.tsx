import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], weight: ["600", "700", "800", "900"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: "Ilmora",
  description: "School management for Pakistani schools",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={nunito.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@500&display=swap"
        />
      </head>
      <body className={`${nunito.className} antialiased`}>{children}</body>
    </html>
  );
}
