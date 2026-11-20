import { notFound } from "next/navigation";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { passportData } from "@/components/passport-view";
import { KIND_ICON, KIND_LABEL, KID_SELECT, type Kid } from "@/lib/learning";
import { shortDate } from "@/lib/format";
import { PrintButton } from "../../paper-check/[id]/print-button";

export const metadata = { title: "Model Passport summary" };
const CSS = `@page { size: A4; margin: 0; } @media print { .no-print { display: none !important; } .print-root { padding: 0 !important; background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; } }`;
const ORDER = ["achievement", "certificate", "milestone", "project", "skill", "creative", "reflection"];

// A premium one-page achievement summary: approved items only, no contact details or ids.
export default async function PassportPrint({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("student", "parent", "teacher", "principal", "owner");
  const { id } = await params;
  const supabase = await createClient();
  const { data: k } = await supabase.from("students").select(`${KID_SELECT}, campuses(name, schools(name))`).eq("id", id).maybeSingle();
  if (!k) notFound();
  const kid = k as unknown as Kid & { campuses: { name: string; schools: { name: string } | null } | null };
  const { items, goals } = await passportData(id);
  const ok = items.filter((i) => i.status === "approved");
  const reached = goals.filter((g) => g.status === "done");
  const school = kid.campuses?.schools?.name ?? kid.campuses?.name ?? "";
  return (
    <div className="print-root" style={{ background: "#e5e5e5", minHeight: "100vh", padding: "24px 0" }}>
      <style>{CSS}</style>
      <div className="no-print mx-auto mb-4 flex items-center justify-between gap-3 px-2" style={{ maxWidth: "210mm" }}>
        <div className="text-sm">Only teacher-approved entries are printed. Choose &quot;Save as PDF&quot; to download.</div><PrintButton />
      </div>
      <div className="sheet mx-auto bg-white" style={{ width: "210mm", minHeight: "297mm", boxShadow: "0 2px 12px #0002" }}>
        <div style={{ background: "linear-gradient(135deg,#0f2a44,#12806b)", color: "#fff", padding: "18mm 16mm 12mm" }}>
          <div style={{ letterSpacing: ".3em", fontSize: 11, fontWeight: 900, opacity: .85 }}>MODEL PASSPORT · ACHIEVEMENT SUMMARY</div>
          <div style={{ fontSize: 34, fontWeight: 900, marginTop: 6 }}>{kid.full_name}</div>
          <div style={{ fontWeight: 700, opacity: .9 }}>{kid.sections ? `${kid.sections.classes.name}-${kid.sections.name}` : ""} · {school}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            {ORDER.map((kk) => { const n = ok.filter((i) => i.kind === kk).length; return n ? <span key={kk} style={{ background: "#ffffff22", borderRadius: 99, padding: "4px 12px", fontWeight: 800, fontSize: 13 }}>{KIND_ICON[kk]} {n} {KIND_LABEL[kk][0]}</span> : null; })}
          </div>
        </div>
        <div style={{ padding: "10mm 16mm", display: "grid", gap: 14 }}>
          {ok.length === 0 && <p style={{ color: "#6b7280" }}>No approved entries yet.</p>}
          {ORDER.map((kk) => {
            const list = ok.filter((i) => i.kind === kk);
            if (!list.length) return null;
            return (
              <div key={kk} style={{ breakInside: "avoid" }}>
                <div style={{ fontWeight: 900, fontSize: 15, color: "#0f2a44", borderBottom: "2px solid #f3b94b", paddingBottom: 4, marginBottom: 6 }}>{KIND_ICON[kk]} {KIND_LABEL[kk][0]}</div>
                {list.map((i) => (
                  <div key={i.id} style={{ display: "flex", gap: 10, padding: "4px 0" }}>
                    <div style={{ width: 70, color: "#6b7280", fontSize: 12, fontWeight: 700 }}>{shortDate(i.happened_on)}</div>
                    <div style={{ flex: 1 }}><b>{i.title}</b>{i.subjects ? <span style={{ color: "#6b7280" }}> · {i.subjects.name}</span> : null}{i.body ? <div style={{ fontSize: 12.5 }}>{i.body}</div> : null}</div>
                  </div>
                ))}
              </div>
            );
          })}
          {reached.length > 0 && (
            <div style={{ breakInside: "avoid" }}>
              <div style={{ fontWeight: 900, fontSize: 15, color: "#0f2a44", borderBottom: "2px solid #f3b94b", paddingBottom: 4, marginBottom: 6 }}>🎯 Learning goals reached</div>
              {reached.map((g) => <div key={g.id} style={{ padding: "2px 0" }}>✓ {g.goal}</div>)}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280" }}>Every entry here was approved by a teacher at {school}. This summary has no contact details or student ID numbers.</div>
        </div>
      </div>
    </div>
  );
}
