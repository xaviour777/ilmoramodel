import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { shortDate, time } from "@/lib/format";
import { PrintButton } from "../paper-check/[id]/print-button";

const PRINT_CSS = `@page { size: A4; margin: 10mm; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; } .break { break-after: page; } }`;
type Kid = { id: string; full_name: string; roll_no: string | null; admission_no: string | null; photo_url: string | null; father_name: string | null; family_id: string | null; section_id: string };
type Paper = { class_id: string; paper_date: string; starts_at: string | null; ends_at: string | null; subjects: { name: string } };

// Admit cards, roll number slips, attendance sheets and answer-sheet labels for one exam.
export default async function ExamDayPrint({ searchParams }: { searchParams: Promise<{ exam?: string; type?: string; date?: string; allow?: string }> }) {
  const me = await requireRole("principal", "owner", "accountant");
  const sp = await searchParams;
  const supabase = await createClient();
  const type = ["admit", "slips", "attendance", "labels"].includes(sp.type ?? "") ? sp.type! : "admit";
  const [{ data: exam }, { data: papers }, { data: campus }, { data: principal }] = await Promise.all([
    supabase.from("exams").select("id, name, exam_sections(section_id)").eq("id", sp.exam ?? "").maybeSingle(),
    supabase.from("exam_papers").select("class_id, paper_date, starts_at, ends_at, subjects(name)").eq("exam_id", sp.exam ?? "").order("paper_date").order("starts_at"),
    supabase.from("campuses").select("name, schools(name, logo_url)").eq("id", me.campus_id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("role", "principal").eq("is_active", true).limit(1).maybeSingle(),
  ]);
  if (!exam) return <p style={{ padding: 24 }}>Choose an exam from Exams → Exam day.</p>;
  const school = campus?.schools as unknown as { name: string; logo_url: string | null } | null;
  const secIds = (exam.exam_sections as { section_id: string }[]).map((s) => s.section_id);
  const [{ data: secs }, kids, { data: owing }] = await Promise.all([
    supabase.from("sections").select("id, name, class_id, classes(name, sort)").in("id", secIds.length ? secIds : ["00000000-0000-0000-0000-000000000000"]),
    secIds.length ? fetchAll<Kid>((f, t) => supabase.from("students").select("id, full_name, roll_no, admission_no, photo_url, father_name, family_id, section_id").eq("status", "enrolled").in("section_id", secIds).order("roll_no").order("full_name").range(f, t) as unknown as PromiseLike<{ data: Kid[] | null; error: unknown }>) : Promise.resolve([] as Kid[]),
    supabase.from("family_balances").select("family_id").gt("balance_paisa", 0),
  ]);
  type Sec = { id: string; name: string; class_id: string; classes: { name: string; sort: number } };
  const S = new Map(((secs ?? []) as unknown as Sec[]).map((s) => [s.id, s]));
  const owe = new Set((owing ?? []).map((o) => o.family_id));
  const P = (papers ?? []) as unknown as Paper[];
  const ordered = [...kids].sort((a, b) => (S.get(a.section_id)?.classes.sort ?? 0) - (S.get(b.section_id)?.classes.sort ?? 0) || (S.get(a.section_id)?.name ?? "").localeCompare(S.get(b.section_id)?.name ?? "") || Number(a.roll_no ?? 0) - Number(b.roll_no ?? 0));
  const held = type === "admit" && sp.allow !== "1" ? ordered.filter((k) => k.family_id && owe.has(k.family_id)) : [];
  const list = ordered.filter((k) => !held.includes(k));
  const label = (k: Kid) => { const s = S.get(k.section_id); return s ? `${s.classes.name}-${s.name}` : ""; };
  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: "3mm", borderBottom: "1.5px solid #000", paddingBottom: "2mm", marginBottom: "2mm" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {school?.logo_url && <img src={school.logo_url} alt="" style={{ width: "10mm", height: "10mm", objectFit: "contain" }} />}
      <div><div style={{ fontWeight: 900, fontSize: "12pt" }}>{school?.name}</div><div style={{ fontSize: "9pt" }}>{campus?.name} · {exam.name}</div></div>
    </div>
  );
  const cell = { border: "1px solid #000", padding: "1.2mm 2mm" } as const;
  const bySection = [...new Set(list.map((k) => k.section_id))];
  return (
    <div style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }} className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "210mm" }}>
        <div className="text-sm">{list.length} {type === "admit" ? "admit cards" : type === "slips" ? "roll number slips" : type === "labels" ? "labels" : "students"} · {exam.name}{held.length ? ` · ${held.length} held for unpaid fees (open "Admit cards for everyone" to print them too)` : ""}</div>
        <PrintButton />
      </div>
      <div className="sheet mx-auto bg-white text-black shadow-lg" style={{ width: "210mm", padding: "10mm", fontSize: "10pt" }}>
        {list.length === 0 && <p>No students to print.</p>}
        {type === "admit" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4mm" }}>
            {list.map((k) => (
              <div key={k.id} style={{ border: "1.5px solid #000", padding: "3mm", breakInside: "avoid" }}>
                {head}
                <div style={{ textAlign: "center", fontWeight: 900, letterSpacing: ".1em" }}>ADMIT CARD</div>
                <div style={{ display: "flex", gap: "3mm", marginTop: "2mm" }}>
                  <div style={{ flex: 1, lineHeight: 1.6 }}>
                    <div>Name: <b>{k.full_name}</b></div><div>Father: <b>{k.father_name ?? ""}</b></div>
                    <div>Class: <b>{label(k)}</b> · Roll: <b>{k.roll_no ?? ""}</b></div><div>Student ID: <b>{k.admission_no ?? ""}</b></div>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {k.photo_url ? <img src={k.photo_url} alt="" style={{ width: "20mm", height: "26mm", objectFit: "cover", border: "1px solid #000" }} /> : <div style={{ width: "20mm", height: "26mm", border: "1px dashed #000", fontSize: "8pt", display: "flex", alignItems: "center", justifyContent: "center" }}>Photo</div>}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "2mm", fontSize: "8.5pt" }}>
                  <tbody>{P.filter((p) => p.class_id === S.get(k.section_id)?.class_id).map((p, i) => <tr key={i}><td style={cell}>{shortDate(p.paper_date)}</td><td style={cell}>{p.subjects.name}</td><td style={cell}>{time(p.starts_at)}{p.ends_at ? `–${time(p.ends_at)}` : ""}</td></tr>)}</tbody>
                </table>
                <div style={{ marginTop: "4mm", display: "flex", justifyContent: "space-between", fontSize: "9pt" }}><span>Student&apos;s signature</span><span>{principal?.full_name ?? "Principal"}</span></div>
              </div>
            ))}
          </div>
        )}
        {type === "slips" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3mm" }}>
            {list.map((k) => (
              <div key={k.id} style={{ border: "1px dashed #000", padding: "2.5mm", breakInside: "avoid", fontSize: "9pt" }}>
                <div style={{ fontWeight: 900 }}>{school?.name}</div><div>{exam.name}</div>
                <div style={{ fontSize: "16pt", fontWeight: 900 }}>Roll {k.roll_no ?? "—"}</div><div>{k.full_name}</div><div>{label(k)} · {k.admission_no}</div>
              </div>
            ))}
          </div>
        )}
        {type === "labels" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2mm" }}>
            {list.flatMap((k) => P.filter((p) => p.class_id === S.get(k.section_id)?.class_id).map((p, i) => (
              <div key={k.id + i} style={{ border: "1px solid #000", padding: "2mm", fontSize: "8.5pt", breakInside: "avoid" }}>
                <b>{k.full_name}</b><br />{label(k)} · Roll {k.roll_no ?? "—"} · {k.admission_no}<br />{p.subjects.name} · {shortDate(p.paper_date)}
              </div>
            )))}
          </div>
        )}
        {type === "attendance" && bySection.map((sid, si) => (
          <div key={sid} className={si < bySection.length - 1 ? "break" : ""}>
            {head}
            <div style={{ fontWeight: 900, margin: "2mm 0" }}>Attendance sheet · {S.get(sid) ? `${S.get(sid)!.classes.name}-${S.get(sid)!.name}` : ""}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
              <thead><tr><th style={cell}>Roll</th><th style={{ ...cell, textAlign: "left" }}>Student</th>{P.filter((p) => p.class_id === S.get(sid)?.class_id).map((p, i) => <th key={i} style={cell}>{p.subjects.name}<br />{shortDate(p.paper_date)}</th>)}</tr></thead>
              <tbody>{list.filter((k) => k.section_id === sid).map((k) => <tr key={k.id}><td style={cell}>{k.roll_no}</td><td style={cell}>{k.full_name}</td>{P.filter((p) => p.class_id === S.get(sid)?.class_id).map((_, i) => <td key={i} style={{ ...cell, height: "7mm" }} />)}</tr>)}</tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
