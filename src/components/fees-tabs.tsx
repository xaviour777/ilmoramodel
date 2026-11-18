import { Tabs } from "./tabs";

// The fee desk, fee setup with monthly challans, and reminders share the Fees menu entry;
// the accounts office also reaches staff salaries from here.
export function FeesTabs({ current, salaries }: { current: "overview" | "desk" | "setup" | "online" | "messages" | "calls" | "forecast" | "close" | "expenses" | "salaries"; salaries?: boolean }) {
  return (
    <Tabs current={current} tabs={[
      ...(salaries ? [] : [{ id: "overview", label: "Overview", href: "/accounts?view=overview" }]),
      { id: "desk", label: salaries ? "Fee desk" : "Collect at desk", href: salaries ? "/accounts" : "/accounts?view=desk" },
      { id: "setup", label: "Fees and challans", href: "/accounts/setup" },
      { id: "online", label: "Online payments", href: "/accounts/online" },
      { id: "messages", label: "Fee reminders", href: "/accounts/messages" },
      { id: "calls", label: "Defaulters", href: "/accounts/calls" },
      { id: "forecast", label: "Late forecast", href: "/accounts/forecast" },
      { id: "close", label: "Day close", href: "/accounts/day-close" },
      { id: "expenses", label: "Expenses", href: "/accounts/expenses" },
      ...(salaries ? [{ id: "salaries", label: "Salaries", href: "/principal/staff/salaries" }] : []),
    ]} />
  );
}
