import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { pct, rupees } from "@/lib/format";
import { DOC_KINDS, MOVE_LABEL, STATUS_LABEL } from "@/lib/student360";
import { PrintButton } from "../../paper-check/[id]/print-button";

const d = (v?: string | null) => (v ? new Date(v.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

// Student 360 profile sheet on one or two A4 pages: identity, guardians, enrolment, fees,
// attendance, results, documents and certificates.
export default async function Student360Sheet({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("principal", "owner", "accountant");
  const { id } = await params;
  const sb = await createClient();
  const { data: s } = await sb.from("students").select("*, families(name, phone, address), sections(name, classes(name))").eq("id", id).maybeSingle();
  if (!s) notFound();
  const fam = s.families as { name: string; phone: string | null; address: string | null } | null;
  const [{ data: camp }, { data: year }, { data: bal }, { data: contacts }, { data: moves }, { data: secs }, { data: marks }, { data: docs }, { data: certs }, { data: notes }] = await Promise.all([
    sb.from("campuses").select("name, schools(name, logo_url)").eq("id", me.campus_id).maybeSingle(),
    sb.from("academic_sessions").select("name, starts_on").eq("is_current", true).maybeSingle(),
    sb.from("family_balances").select("balance_paisa").eq("family_id", s.family_id).maybeSingle(),
    sb.from("student_contacts").select("name, relation, phone, is_emergency, can_pick_up").eq("student_id", id).order("sort"),
    sb.from("student_moves").select("kind, from_section_id, to_section_id, reason, effective_on, undone_at").eq("student_id", id).is("undone_at", null).order("effective_on"),
    sb.from("sections").select("id, name, classes(name)"),
    sb.from("marks").select("obtained, is_absent, exams(id, name, total_marks, starts_on, status)").eq("student_id", id),
    sb.from("student_documents").select("kind, number, expires_on, verified").eq("student_id", id),
    sb.from("student_certificates").select("kind, serial_no, issued_on").eq("student_id", id).order("issued_on"),
    sb.from("behaviour_notes").select("kind, note, created_at").eq("student_id", id).order("created_at", { ascending: false }).limit(5),
  ]);
  const { data: att } = await sb.from("attendance").select("status").eq("student_id", id).gte("date", year?.starts_on ?? "1900-01-01");
  const a = att ?? [];
  const pr = a.filter((x) => x.status === "present" || x.status === "late").length;
  const secName = new Map(((secs ?? []) as unknown as { id: string; name: string; classes: { name: string } }[]).map((x) => [x.id, `${x.classes.name}-${x.name}`]));
  type M = { obtained: number | null; is_absent: boolean; exams: { id: string; name: string; total_marks: number; starts_on: string | null; status: string } };
  const ex = new Map<string, { n: string; got: number; out: number; date: string }>();
  for (const m of (marks ?? []) as unknown as M[]) {
    if (m.exams.status !== "results") continue;
    const e = ex.get(m.exams.id) ?? { n: m.exams.name, got: 0, out: 0, date: m.exams.starts_on ?? "" };
    e.got += Number(m.obtained ?? 0); e.out += m.exams.total_marks; ex.set(m.exams.id, e);
  }
  const school = camp?.schools as unknown as { name: string; logo_url: string | null } | null;
  const sec = s.sections as { name: string; classes: { name: string } } | null;
  const box: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", marginTop: 8, breakInside: "avoid" };
  const h: React.CSSProperties = { fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".06em", color: "#374151", margin: "0 0 4px" };
  const row = (k: string, v: React.ReactNode) => <div style={{ display: "flex", gap: 8 }}><span style={{ color: "#6b7280", minWidth: 120 }}>{k}</span><b>{v || "—"}</b></div>;
  return (
    <div style={{ background: "#fff", minHeight: "100vh", padding: 24, fontFamily: "sans-serif", fontSize: 12, color: "#111" }}>
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4; margin: 10mm } } table{border-collapse:collapse;width:100%} td,th{border-bottom:1px solid #e5e7eb;padding:3px 4px;text-align:left}`}</style>
      <div className="no-print" style={{ marginBottom: 12 }}><PrintButton /></div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #111", paddingBottom: 8 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {school?.logo_url && <img src={school.logo_url} alt="" style={{ height: 40 }} />}
          <div><div style={{ fontSize: 16, fontWeight: 900 }}>{school?.name}{camp?.name ? ` · ${camp.name}` : ""}</div><div style={{ fontWeight: 800 }}>Student 360 profile</div></div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {s.photo_url && <img src={s.photo_url} alt="" style={{ width: 70, height: 84, objectFit: "cover", border: "1px solid #d1d5db" }} />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={box}><p style={h}>Identity</p>
          {row("Name", s.full_name)}{row("GR no", s.admission_no)}{row("Class", sec ? `${sec.classes.name}-${sec.name}` : "")}{row("Roll no", s.roll_no)}
          {row("Status", `${STATUS_LABEL[s.status] ?? s.status}${s.left_on ? ` (${d(s.left_on)})` : ""}`)}{row("Date of birth", s.date_of_birth ? d(s.date_of_birth) : "")}{row("B-form", s.b_form)}{row("Admitted", d(s.admitted_on))}
        </div>
        <div style={box}><p style={h}>Family and guardians</p>
          {row("Father", s.father_name)}{row("Mother", s.mother_name)}{row("Family", fam?.name)}{row("Mobile", fam?.phone)}{row("Address", s.address ?? fam?.address)}
          {(contacts ?? []).map((c, i) => <div key={i}>{c.name} ({c.relation}) {c.phone ?? ""}{c.is_emergency ? " · emergency" : ""}{c.can_pick_up ? " · may pick up" : ""}</div>)}
        </div>
        <div style={box}><p style={h}>This year</p>
          {row("Attendance", a.length ? `${pct(pr / a.length)} (${pr} of ${a.length} days)` : "")}{row("Family balance", rupees(Number(bal?.balance_paisa ?? 0)))}
          {(notes ?? []).length > 0 && <div style={{ marginTop: 4 }}>{(notes ?? []).map((n, i) => <div key={i}>{n.kind === "praise" ? "★" : "!"} {n.note}</div>)}</div>}
        </div>
        <div style={box}><p style={h}>Documents and certificates</p>
          {(docs ?? []).map((x, i) => <div key={i}>{DOC_KINDS[x.kind] ?? x.kind}{x.number ? ` ${x.number}` : ""}{x.expires_on ? ` · expires ${d(x.expires_on)}` : ""}{x.verified ? " ✓" : ""}</div>)}
          {(certs ?? []).map((c, i) => <div key={"c" + i}>{c.serial_no} · {c.kind} · {d(c.issued_on)}</div>)}
          {!(docs ?? []).length && !(certs ?? []).length && <div>None on file.</div>}
        </div>
      </div>
      <div style={box}><p style={h}>Enrolment history</p>
        <table><tbody>
          <tr><td>{d(s.admitted_on)}</td><td>Admitted</td><td /></tr>
          {(moves ?? []).map((m, i) => <tr key={i}><td>{d(m.effective_on)}</td><td>{MOVE_LABEL[m.kind] ?? m.kind}</td><td>{m.to_section_id && m.to_section_id !== m.from_section_id ? `${secName.get(m.from_section_id ?? "") ?? ""} → ${secName.get(m.to_section_id) ?? ""}` : secName.get(m.from_section_id ?? "") ?? ""}{m.reason ? ` · ${m.reason}` : ""}</td></tr>)}
        </tbody></table>
      </div>
      <div style={box}><p style={h}>Published results</p>
        {ex.size === 0 ? <div>No published results.</div> : <table><tbody>{[...ex.values()].sort((x, y) => x.date.localeCompare(y.date)).map((e) => <tr key={e.n}><td>{e.n}</td><td>{e.got} / {e.out}</td><td>{e.out ? pct(e.got / e.out, 1) : ""}</td></tr>)}</tbody></table>}
      </div>
      <p style={{ marginTop: 10, color: "#6b7280" }}>Printed {new Date().toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} by {me.full_name}. Confidential: for school use.</p>
    </div>
  );
}
