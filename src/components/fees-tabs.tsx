import { Tabs } from "./tabs";

// The fee desk, fee setup with monthly challans, and reminders share the Fees menu entry;
// the accounts office also reaches staff salaries from here.
export function FeesTabs({ current, salaries }: { current: "desk" | "setup" | "messages" | "calls" | "close" | "expenses" | "salaries"; salaries?: boolean }) {
  return (
    <Tabs current={current} tabs={[
      { id: "desk", label: "Fee desk", href: "/accounts" },
      { id: "setup", label: "Fees and challans", href: "/accounts/setup" },
      { id: "messages", label: "Fee reminders", href: "/accounts/messages" },
      { id: "calls", label: "Defaulters", href: "/accounts/calls" },
      { id: "close", label: "Day close", href: "/accounts/day-close" },
      { id: "expenses", label: "Expenses", href: "/accounts/expenses" },
      ...(salaries ? [{ id: "salaries", label: "Salaries", href: "/principal/staff/salaries" }] : []),
    ]} />
  );
}
