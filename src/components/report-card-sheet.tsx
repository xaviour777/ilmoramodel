import { pct } from "@/lib/format";
import type { ReportCard } from "@/lib/report-card";

// One A4 report card. Plain black on white so it prints well on any printer.
export function ReportCardSheet({ c, school, campus, session, section, classTeacher }: {
  c: ReportCard; school: string; campus: string; session: string; section: string; classTeacher: string;
}) {
  const cell = { border: "1px solid #000", padding: "1.5mm 2mm" } as const;
  return (
    <div className="sheet mx-auto mb-6 bg-white text-black shadow-lg" style={{ width: "210mm", minHeight: "297mm", padding: "14mm 14mm", fontSize: "10.5pt" }}>
      <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: "3mm" }}>
        <div style={{ fontSize: "18pt", fontWeight: 900 }}>{school}</div>
        <div>{campus}</div>
        <div style={{ fontSize: "13pt", fontWeight: 800, marginTop: "2mm" }}>Progress Report · {session}</div>
      </div>
      <table style={{ width: "100%", margin: "4mm 0", borderCollapse: "collapse" }}>
        <tbody>
          <tr><td>Name: <b>{c.student.full_name}</b></td><td>Class: <b>{section}</b></td></tr>
          <tr><td>Roll no: <b>{c.student.roll_no ?? ""}</b></td><td>Admission no: <b>{c.student.admission_no ?? ""}</b></td></tr>
        </tbody>
      </table>
      {c.exams.length === 0 ? <p>No published results yet this session.</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center" }}>
          <thead>
            <tr><th style={{ ...cell, textAlign: "left" }}>Subject</th>{c.exams.map((e) => <th key={e.id} style={cell}>{e.name}<br /><span style={{ fontWeight: 400 }}>/{e.total}</span></th>)}<th style={cell}>Total</th><th style={cell}>%</th></tr>
          </thead>
          <tbody>
            {c.subjects.map((s) => (
              <tr key={s.name}><td style={{ ...cell, textAlign: "left" }}>{s.name}</td>{s.marks.map((m, i) => <td key={i} style={cell}>{m ?? "–"}</td>)}<td style={cell}>{s.got}/{s.out}</td><td style={cell}>{s.out ? pct(s.got / s.out) : ""}</td></tr>
            ))}
            <tr style={{ fontWeight: 800 }}><td style={{ ...cell, textAlign: "left" }} colSpan={c.exams.length + 1}>Grand total</td><td style={cell}>{c.got}/{c.out}</td><td style={cell}>{pct(c.percent, 1)}</td></tr>
          </tbody>
        </table>
      )}
      <table style={{ width: "100%", marginTop: "5mm", borderCollapse: "collapse", textAlign: "center" }}>
        <tbody><tr>
          <td style={cell}>Grade<br /><b style={{ fontSize: "14pt" }}>{c.grade || "–"}</b></td>
          <td style={cell}>Position in class<br /><b style={{ fontSize: "14pt" }}>{c.position ? `${c.position} of ${c.outOf}` : "–"}</b></td>
          <td style={cell}>Attendance<br /><b style={{ fontSize: "14pt" }}>{c.attendance.days ? `${c.attendance.present}/${c.attendance.days} (${pct(c.attendance.present / c.attendance.days)})` : "–"}</b></td>
        </tr></tbody>
      </table>
      <div style={{ marginTop: "6mm" }}>Class teacher&apos;s remarks:</div>
      <div style={{ borderBottom: "1px solid #000", height: "9mm" }} /><div style={{ borderBottom: "1px solid #000", height: "9mm" }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "22mm" }}>
        <div style={{ borderTop: "1px solid #000", width: "55mm", textAlign: "center", paddingTop: "1mm" }}>Class teacher{classTeacher ? ` (${classTeacher})` : ""}</div>
        <div style={{ borderTop: "1px solid #000", width: "45mm", textAlign: "center", paddingTop: "1mm" }}>Principal</div>
        <div style={{ borderTop: "1px solid #000", width: "45mm", textAlign: "center", paddingTop: "1mm" }}>Parent</div>
      </div>
    </div>
  );
}
