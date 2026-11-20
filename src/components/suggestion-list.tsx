import type { Suggestion } from "@/lib/learning";

// Practice suggestions, each clearly labelled as automatic or from a teacher's rule, with the reason.
export function SuggestionList({ tips, ur, empty }: { tips: Suggestion[]; ur: boolean; empty: string }) {
  if (!tips.length) return <p className="muted">{empty}</p>;
  return (
    <div className="flex flex-col gap-2">
      {tips.map((s, i) => (
        <div key={i} className="rounded-xl p-3" style={{ background: "var(--purple-soft)" }}>
          <span className="pill pill-gray mb-1">{s.source === "teacher" ? (ur ? "استاد کا اصول · خودکار مشورہ" : "Teacher's rule · automatic") : (ur ? "خودکار مشورہ" : "Automatic suggestion")}</span>
          <div className="font-extrabold">{s.text}</div>
          <div className="text-xs font-bold" style={{ color: "var(--purple-ink)" }}>{ur ? "کیوں: " : "Why: "}{s.why}</div>
        </div>
      ))}
    </div>
  );
}
