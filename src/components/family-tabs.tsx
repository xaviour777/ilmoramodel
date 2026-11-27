import Link from "next/link";
import { UnderTabs } from "./classes-tabs";
import type { Kid } from "@/lib/learning";
import { moduleOn } from "@/lib/modules";

// Tabs on the student and parent home screens (new screens are tabs, not new menu items).
export async function StudentTabs({ current, ur }: { current: "today" | "passport"; ur: boolean }) {
  if (!(await moduleOn("passport"))) return null;
  return <UnderTabs current={current} tabs={[
    { id: "today", label: ur ? "میری سیکھنے کی جگہ" : "My Learning Space", href: "/student" },
    { id: "passport", label: ur ? "ماڈل پاسپورٹ" : "Model Passport", href: "/student/passport" },
  ]} />;
}

export async function ParentTabs({ current, child, ur }: { current: "today" | "details" | "passport"; child?: string; ur: boolean }) {
  const q = child ? `?child=${child}` : "";
  const passport = await moduleOn("passport");
  return <UnderTabs current={current} tabs={[
    { id: "today", label: ur ? "آج میرا بچہ" : "My Child Today", href: `/parent${q}` },
    { id: "details", label: ur ? "پوری تفصیل" : "Full details", href: `/parent/details${q}` },
    ...(passport ? [{ id: "passport", label: ur ? "ماڈل پاسپورٹ" : "Model Passport", href: `/parent/passport${q}` }] : []),
  ]} />;
}

// Switch between the children of one verified guardian (row-level security only returns their own).
export function ChildSwitch({ kids, current, path }: { kids: Kid[]; current?: string; path: string }) {
  if (kids.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {kids.map((k) => (
        <Link key={k.id} href={`${path}?child=${k.id}`} className="inline-flex min-h-11 items-center rounded-xl border-2 bg-white px-4 font-black"
          style={k.id === current ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)", color: "var(--blue-ink)" } : { borderColor: "var(--line)" }}>
          {k.full_name.split(" ")[0]} · {k.sections ? `${k.sections.classes.name.replace("Class ", "")}-${k.sections.name}` : ""}
        </Link>
      ))}
    </div>
  );
}
