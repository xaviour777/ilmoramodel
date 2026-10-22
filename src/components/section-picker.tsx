import Link from "next/link";
import type { SectionOption } from "@/lib/teacher";

// Pills that switch the page to another section, keeping other query values.
export function SectionPicker({ sections, current, base, extra = "" }: { sections: SectionOption[]; current: string; base: string; extra?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {sections.map((s) => (
        <Link
          key={s.id}
          href={`${base}?section=${s.id}${extra}`}
          className="inline-flex min-h-10 items-center rounded-full border-2 px-3.5 text-sm font-extrabold"
          style={s.id === current
            ? { borderColor: "var(--blue-ring)", background: "var(--blue-soft)", color: "var(--blue-ink)" }
            : { borderColor: "var(--line)", background: "#fff" }}
          aria-current={s.id === current ? "page" : undefined}
        >
          {s.label}{s.isClassTeacher ? " ★" : ""}
        </Link>
      ))}
    </div>
  );
}
