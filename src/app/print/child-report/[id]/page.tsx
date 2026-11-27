import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { kidToday } from "@/lib/kid-today";
import { band, familyUrdu, KID_SELECT, KIND_ICON, say, trendSentence, type Kid } from "@/lib/learning";
import { shortDate } from "@/lib/format";
import { PrintButton } from "../../paper-check/[id]/print-button";

export const metadata = { title: "Child progress report", robots: { index: false } };
const CSS = `@page { size: A4; margin: 12mm; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; } }`;
const P = (x: number) => `${Math.round(x * 100)}%`;

// A privacy-safe report for the family: only this child, no ID numbers, phone numbers, address or fees,
// and no comparison with other children.
export default async function ChildReport({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("parent", "student", "teacher", "principal", "owner");
  const ur = await familyUrdu(me.role);
  const t = say(ur);
  const { id } = await params;
  const supabase = await createClient();
  const { data: k } = await supabase.from("students").select(`${KID_SELECT}, campuses(name, schools(name))`).eq("id", id).maybeSingle();
  if (!k) notFound();
  const kid = k as unknown as Kid & { campuses: { name: string; schools: { name: string } | null } | null };
  const d = await kidToday(supabase, kid);
  const school = kid.campuses?.schools?.name ?? kid.campuses?.name ?? "";
  const H = ({ children }: { children: React.ReactNode }) => <h2 style={{ fontWeight: 900, fontSize: 16, color: "#0f2a44", borderBottom: "2px solid #e5e7eb", paddingBottom: 4, marginTop: 14 }}>{children}</h2>;
  return (
    <div className="print-root" style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }}>
      <style>{CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "210mm" }}>
        <div className="text-sm">{t("Choose \"Save as PDF\" to download.", "ڈاؤن لوڈ کے لیے \"Save as PDF\" چنیں۔")}</div><PrintButton />
      </div>
      <div className="sheet mx-auto bg-white" style={{ width: "210mm", padding: "14mm", boxShadow: "0 2px 12px #0002" }} dir={ur ? "rtl" : "ltr"} lang={ur ? "ur" : "en"}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{school} · {t("Report for the family", "گھر والوں کے لیے رپورٹ")} · {shortDate(d.today)}</div>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>{kid.full_name}</h1>
        <div style={{ fontWeight: 700 }}>{kid.sections ? `${kid.sections.classes.name}-${kid.sections.name}` : ""}</div>

        <H>{t("Attendance", "حاضری")}</H>
        <p>{d.attendanceRate != null ? t(`Came to school on ${P(d.attendanceRate)} of the ${d.attendanceDays} marked days in the last 30 days.`, `پچھلے 30 دنوں کے ${d.attendanceDays} دنوں میں سے ${P(d.attendanceRate)} دن اسکول آیا/آئی۔`) : t("No attendance marked yet.", "ابھی حاضری نہیں لگی۔")}</p>

        <H>{t("Progress over time", "وقت کے ساتھ ترقی")}</H>
        {d.steps.length === 0 ? <p>{t("No published results yet.", "ابھی کوئی نتیجہ جاری نہیں ہوا۔")}</p> : (
          <>
            <p>{d.steps.map((s) => `${s.name}: ${P(s.r)}`).join("  →  ")}</p>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6, fontSize: 13 }}>
              <tbody>{d.subjects.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid #eee" }}><td style={{ padding: "4px 0", fontWeight: 800 }}>{s.name}</td><td>{P(s.latest)}</td><td>{band(s.latest, ur).word}</td><td>{trendSentence(s, ur).text}</td></tr>
              ))}</tbody>
            </table>
          </>
        )}

        <H>{t("Upcoming tests", "آنے والے ٹیسٹ")}</H>
        {d.upcoming.length === 0 ? <p>{t("None in the next few weeks.", "اگلے چند ہفتوں میں کوئی نہیں۔")}</p> : d.upcoming.slice(0, 8).map((u, i) => <div key={i}>{shortDate(u.on_date)} · {u.subject} · {u.title}</div>)}

        <H>{t("Teacher feedback", "استاد کی رائے")}</H>
        {d.notes.length === 0 && d.remarks.length === 0 ? <p>{t("Nothing new.", "کچھ نیا نہیں۔")}</p> : (
          <>{d.notes.map((n) => <div key={n.id}>• {n.note}</div>)}{d.remarks.map((r, i) => <div key={i}>• {r.homework?.subjects?.name ? `${r.homework.subjects.name}: ` : ""}{r.remark}</div>)}</>
        )}

        <H>{t("Approved achievements", "منظور شدہ کامیابیاں")}</H>
        {d.items.filter((i) => i.status === "approved").length === 0 ? <p>{t("None yet.", "ابھی کوئی نہیں۔")}</p>
          : d.items.filter((i) => i.status === "approved").slice(0, 12).map((i) => <div key={i.id}>{KIND_ICON[i.kind]} {i.title} · {shortDate(i.happened_on)}</div>)}

        <p style={{ marginTop: 18, fontSize: 11, color: "#6b7280" }}>{t("Private to the family. This report has no ID numbers, phone numbers, address or fee details, and does not compare the child with others.", "یہ رپورٹ صرف گھر والوں کے لیے ہے۔ اس میں کوئی شناختی نمبر، فون نمبر، پتہ یا فیس کی تفصیل نہیں، اور بچے کا دوسروں سے موازنہ نہیں۔")}</p>
      </div>
    </div>
  );
}
