import { Tabs } from "./tabs";

// Settings, AI, the AI feature switches, the school year, optional modules and My profile share one menu entry.
export function SettingsTabs({ current }: { current: "connect" | "ai" | "aifeatures" | "year" | "modules" | "profile" }) {
  return (
    <Tabs current={current} tabs={[
      { id: "connect", label: "WhatsApp & SMS setup", href: "/settings" },
      { id: "ai", label: "AI key and budget", href: "/settings/ai" },
      { id: "aifeatures", label: "AI features", href: "/principal/ai" },
      { id: "year", label: "School year", href: "/settings/year" },
      { id: "modules", label: "Extra modules", href: "/settings/modules" },
      { id: "profile", label: "My profile", href: "/profile" },
    ]} />
  );
}
