import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ilmora",
  description: "School management for Pakistani schools",
  applicationName: "Ilmora",
  appleWebApp: { capable: true, title: "Ilmora", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#103d37" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&family=Manrope:wght@400;500;600;700;800&family=Noto+Nastaliq+Urdu:wght@500&display=swap"
        />
        {/* only the icons the principal screens use, so the font stays small;
            display=block so an icon never shows as its name while loading */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..24,400..600,0..1,0&icon_names=account_balance,arrow_right_alt,assignment,auto_awesome,badge,calendar_month,call,campaign,cast_for_education,chevron_right,close,co_present,currency_exchange,dashboard,edit_note,event,fact_check,family_restroom,forum,history,hourglass_top,how_to_reg,install_mobile,logout,menu,notification_important,notifications,payments,person,person_add,point_of_sale,qr_code_2,qr_code_scanner,receipt_long,school,search,settings,task_alt,trending_down,trending_up&display=block"
        />
      </head>
      <body className="antialiased">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
