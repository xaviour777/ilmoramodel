import { Tabs } from "./tabs";

// Settings, the school year, the WhatsApp & SMS outbox and My profile share one menu entry; these tabs move between them.
export function SettingsTabs({ current }: { current: "connect" | "year" | "messages" | "profile" }) {
  return (
    <Tabs current={current} tabs={[
      { id: "connect", label: "WhatsApp & SMS setup", href: "/settings" },
      { id: "year", label: "School year", href: "/settings/year" },
      { id: "messages", label: "Messages sent", href: "/accounts/messages" },
      { id: "profile", label: "My profile", href: "/profile" },
    ]} />
  );
}
