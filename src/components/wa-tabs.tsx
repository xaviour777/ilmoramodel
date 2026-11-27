import { Tabs } from "./tabs";
import { getMe } from "@/lib/me";

// Everything about messages to parents in one menu entry: the outbox with fee reminders,
// the WhatsApp numbers and auto flows, the sent log, the principal's morning brief and the setup.
export async function WaTabs({ current }: { current: "outbox" | "numbers" | "flows" | "log" | "brief" | "setup" }) {
  const me = await getMe();
  const admin = me.role === "principal" || me.role === "owner";
  return <Tabs current={current} tabs={[
    { id: "outbox", label: "Outbox & reminders", href: "/accounts/messages" },
    { id: "numbers", label: "WhatsApp numbers", href: "/whatsapp" },
    { id: "flows", label: "Auto flows", href: "/whatsapp/flows" },
    { id: "log", label: "WhatsApp log", href: "/whatsapp/log" },
    ...(admin ? [{ id: "brief", label: "Morning brief", href: "/whatsapp/brief" }, { id: "setup", label: "Setup", href: "/settings" }] : []),
  ]} />;
}

export function ModuleOff() {
  return (
    <section className="card">
      <div className="kick">Premium module</div>
      <h2 className="h2">WhatsApp automation</h2>
      <ul className="list-disc pl-5 text-sm font-bold">
        <li>Link 5–6 of your own WhatsApp numbers by QR scan. No per-message charges.</li>
        <li>Messages rotate across numbers with human-like pauses and a daily cap per number.</li>
        <li>Drag-and-drop auto flows: fee reminders before and after the due date, absence alerts, results, birthdays.</li>
      </ul>
      <p className="muted text-sm">Ask Prinqo to switch it on for your school.</p>
    </section>
  );
}

