import { Tabs } from "./tabs";
export function WaTabs({ current }: { current: "numbers" | "flows" | "log" }) {
  return <Tabs current={current} tabs={[{ id: "numbers", label: "Numbers", href: "/whatsapp" }, { id: "flows", label: "Auto flows", href: "/whatsapp/flows" }, { id: "log", label: "Sent log", href: "/whatsapp/log" }]} />;
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
      <p className="muted text-sm">Ask Ilmora to switch it on for your school.</p>
    </section>
  );
}

