import { gridShape, type Cell } from "@/lib/timetable";
import { time } from "@/lib/format";

const PALETTE = ["var(--blue-soft)", "var(--purple-soft)", "var(--orange-soft)", "var(--green-soft)", "var(--red-soft)", "#f2f2f2"];

// A read-only week: periods down the side, days across. `show` picks the second line in a cell.
export function WeekGrid({ cells, today, show = "teacher" }: { cells: Cell[]; today?: number; show?: "teacher" | "section" }) {
  const { periods, days, at } = gridShape(cells);
  if (!periods.length) return <p className="muted">No periods yet.</p>;
  const subjects = [...new Set(cells.map((c) => c.subject))].sort();
  const color = new Map(subjects.map((s, i) => [s, PALETTE[i % PALETTE.length]]));
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `76px repeat(${days.length}, minmax(96px, 1fr))`, minWidth: 76 + days.length * 100 }}>
        <div />
        {days.map((d) => (
          <div key={d.n} className="text-center text-xs font-black" style={d.n === today ? { color: "var(--blue-ink)" } : { color: "var(--muted)" }}>
            {d.label}{d.n === today ? " · today" : ""}
          </div>
        ))}
        {periods.map((p) => (
          <Row key={p.sort} label={`${p.period}`} sub={time(p.starts_at)}>
            {days.map((d) => {
              const c = at.get(`${d.n}-${p.sort}`);
              const second = show === "section" ? c?.section : c?.teacher;
              return (
                <div key={d.n} className="min-h-12 rounded-xl p-1.5 text-center text-[12px] font-extrabold leading-tight"
                  style={{
                    ...(c ? { background: color.get(c.subject) } : { border: "2px dashed var(--line)", color: "var(--muted)" }),
                    ...(d.n === today ? { outline: "2px solid var(--blue-ring)" } : {}),
                  }}>
                  {c ? <>{c.subject}<div className="text-[11px] font-bold opacity-75">{second ?? "No teacher"}</div></> : "Free"}
                </div>
              );
            })}
          </Row>
        ))}
      </div>
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (<><div className="self-center text-xs"><div className="font-extrabold">{label}</div><div className="muted">{sub}</div></div>{children}</>);
}
