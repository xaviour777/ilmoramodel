import { Tabs } from "./tabs";

// The fee desk, fee setup with monthly challans, and reminders share the Fees menu entry.
export function FeesTabs({ current }: { current: "desk" | "setup" | "messages" }) {
  return (
    <Tabs current={current} tabs={[
      { id: "desk", label: "Fee desk", href: "/accounts" },
      { id: "setup", label: "Fees and challans", href: "/accounts/setup" },
      { id: "messages", label: "Fee reminders", href: "/accounts/messages" },
    ]} />
  );
}
