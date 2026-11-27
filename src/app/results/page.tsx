import { headers } from "next/headers";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { getBranding, DEFAULT_COLOR, shade } from "@/lib/branding";
import { PrintButton } from "@/app/print/paper-check/[id]/print-button";

type Card = {
  error?: string; school: string; logo_url: string | null; campus: string; city: string | null; domain: string | null; principal: string | null; exam: string;
  student: string; father: string | null; photo_url: string | null; roll: string; class_roll: string | null; class: string | null; class_teacher: string | null;
  attendance: number | null; subjects: { subject: string; total: number; obtained: number | null; absent: boolean }[]; total: number; obtained: number; position: number | null; out_of: number; code: string;
};
const GR = [["A+", 80], ["A", 70], ["B", 60], ["C", 50], ["D", 40], ["E", 33], ["F", 0]] as const;
const grade = (p: number) => GR.find(([, m]) => p >= m)![0];
// a short remark from the percentage (teachers' own remarks aren't stored per subject)
const remark = (p: number) => (p >= 80 ? "Excellent" : p >= 70 ? "Very good" : p >= 60 ? "Good" : p >= 50 ? "Fair, keep practising" : p >= 33 ? "Needs more work" : "Must improve");

export const metadata = { title: "Check your result" };

// Public result check, no login (design/ResultCheck.dc.html).
// Roll number + exam + date of birth must all match a published result.
export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ roll?: string; exam?: string; dob?: string }> }) {
  const sp = await searchParams;
  const h = await headers();
  const domain = h.get("x-school-domain") ?? "";
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const supabase = await createClient();
  const brand = await getBranding();
  const color = brand?.primary_color ?? DEFAULT_COLOR;
  const { data: exams } = await supabase.rpc("result_exams", { p_domain: domain });
  const list = (exams ?? []) as { id: string; name: string; school: string }[];
  const multi = new Set(list.map((e) => e.school)).size > 1;
  const asked = !!(sp.roll && sp.exam && sp.dob);
  const { data } = asked && /^\d{4}-\d{2}-\d{2}$/.test(sp.dob!) ? await supabase.rpc("result_card", { p_roll: sp.roll, p_exam: sp.exam, p_dob: sp.dob, p_domain: domain, p_ip: ip }) : { data: null };
  const card = data as Card | null;
  const ok = card && !card.error;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const verifyUrl = ok ? `${proto}://${host}/verify/${encodeURIComponent(card!.roll)}?c=${card!.code}` : "";
  const qr = ok ? await QRCode.toDataURL(verifyUrl, { margin: 1, width: 180 }) : "";
  const pct = ok && card!.total ? (Number(card!.obtained) / Number(card!.total)) * 100 : 0;
  const share = ok ? `https://wa.me/?text=${encodeURIComponent(`${card!.student} (${card!.roll}) · ${card!.exam} result: ${Number(card!.obtained)}/${card!.total} (${pct.toFixed(1)}%, grade ${grade(pct)}). Verify: ${verifyUrl}`)}` : "";
  const school = brand?.name ?? (ok ? card!.school : "Prinqo AI");

  return (
    <div className="ilm min-h-screen" style={{ background: "#f7f9fc" }}>
      <style>{`@media print { .no-print { display: none !important; } body, .ilm { background: #fff !important; } .card { box-shadow: none !important; } }`}</style>
      <header className="no-print border-b-2 border-[#e5e7eb] bg-white">
        <div className="mx-auto flex max-w-[960px] items-center gap-2.5 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {brand?.logo_url ? <img src={brand.logo_url} alt="" className="h-10 w-10 rounded-[12px] object-contain" />
            : <span className="flex h-10 w-10 items-center justify-center rounded-[12px] text-[20px] font-black text-white" style={{ background: color, boxShadow: `0 3px 0 ${shade(color)}` }}>{school[0]}</span>}
          <div><div className="font-black" style={{ color: shade(color) }}>{school}</div><div className="muted text-[12px]">Results</div></div>
        </div>
      </header>
      <main className="mx-auto flex max-w-[960px] flex-col gap-5 px-4 py-6">
        <section className="no-print">
          <h1 className="h1">Check your result</h1>
          <p className="muted mt-1 text-[15px]">Enter the student ID from the admit card (for example MS-0001), pick the exam and give the date of birth. The date of birth keeps results private.</p>
        </section>
        <form className="card no-print grid items-end gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label className="field">Student ID / roll number<input className="input" name="roll" required defaultValue={sp.roll} placeholder="MS-0001" autoComplete="off" /></label>
          <label className="field">Exam<select className="input" name="exam" required defaultValue={sp.exam ?? list[0]?.id}>
            {list.length === 0 && <option value="">No results published yet</option>}
            {list.map((e) => <option key={e.id} value={e.id}>{e.name}{multi ? ` · ${e.school}` : ""}</option>)}</select></label>
          <label className="field">Date of birth<input className="input" type="date" name="dob" required defaultValue={sp.dob} /></label>
          <button className="btn" type="submit" style={brand ? { background: color, boxShadow: `0 4px 0 ${shade(color)}` } : undefined}>Show result</button>
        </form>
        {asked && !ok && (
          <div className="card" style={{ background: "#fffbeb", borderColor: "#fcd34d" }}>
            <div className="font-black">{card?.error === "too_many" ? "Too many tries" : `No result for ${sp.roll}`}</div>
            <div className="muted text-[14px]">{card?.error === "too_many" ? "Please wait an hour and try again, or ask the school office." : "Check the student ID and date of birth. The result may not be published yet; the school office can help."}</div>
          </div>
        )}
        {ok && (
          <>
            <article className="card" aria-label="Result card" style={{ background: "#fff" }}>
              <div className="flex flex-wrap items-center gap-3 border-b-2 border-[#e5e7eb] pb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {card!.logo_url ? <img src={card!.logo_url} alt="" className="h-14 w-14 object-contain" /> : <span className="flex h-14 w-14 items-center justify-center rounded-[14px] text-[26px] font-black text-white" style={{ background: color }}>{card!.school[0]}</span>}
                <div className="flex-1"><div className="text-[20px] font-black">{card!.school}</div><div className="muted text-[13px]">{card!.campus}{card!.city ? `, ${card!.city}` : ""}</div></div>
                <div className="text-right"><div className="font-black tracking-[.1em]">RESULT CARD</div><div className="muted text-[13px]">{card!.exam}</div></div>
              </div>
              <div className="mt-3 flex flex-wrap items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {card!.photo_url ? <img src={card!.photo_url} alt={`Photo of ${card!.student}`} className="h-[120px] w-[90px] rounded-[12px] border-2 border-[#e5e7eb] object-cover" />
                  : <div className="flex h-[120px] w-[90px] items-center justify-center rounded-[12px] bg-[#ede9fe] text-[28px] font-black text-[#6d28d9]" role="img" aria-label="No photo">{card!.student.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</div>}
                <div className="grid min-w-[240px] flex-1 gap-2 sm:grid-cols-2">
                  {[["Student", card!.student], ["Student ID", card!.roll], ["Father's name", card!.father ?? "—"], ["Class", `${card!.class ?? "—"}${card!.class_roll ? ` · Roll ${card!.class_roll}` : ""}`],
                    ["Class teacher", card!.class_teacher ?? "—"], ["Attendance", card!.attendance != null ? `${Math.round(Number(card!.attendance) * 100)}%` : "—"]].map(([l, v]) => (
                    <div key={l}><div className="kick">{l}</div><div className="font-black">{v}</div></div>
                  ))}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border-4" style={{ borderColor: pct >= 33 ? "#16a34a" : "#ef4444" }}><span className="text-[28px] font-black">{grade(pct)}</span><span className="muted text-[12px]">{pct.toFixed(1)}%</span></div>
                  <span className={`tagx ${pct >= 33 ? "g" : "r"}`}>{pct >= 33 ? "Pass" : "Not passed"}</span>
                </div>
              </div>
              <div className="tbl mt-3 overflow-x-auto"><table className="w-full min-w-[560px]">
                <thead><tr>{["Subject", "Total", "Obtained", "%", "Grade", "Remark"].map((x) => <th key={x} className="text-left">{x}</th>)}</tr></thead>
                <tbody>{card!.subjects.map((x) => { const p = x.absent || x.obtained == null ? 0 : (Number(x.obtained) / x.total) * 100; return (
                  <tr key={x.subject}><td><b>{x.subject}</b></td><td>{x.total}</td><td>{x.absent ? "Absent" : x.obtained ?? "—"}</td><td>{x.absent ? "—" : `${p.toFixed(0)}%`}</td><td><span className={`tagx ${p >= 60 ? "g" : p >= 33 ? "y" : "r"}`}>{x.absent ? "Abs" : grade(p)}</span></td><td className="muted text-[13px]">{x.absent ? "Absent" : remark(p)}</td></tr>
                ); })}</tbody>
                <tfoot><tr><td><b>Total</b></td><td><b>{card!.total}</b></td><td><b>{Number(card!.obtained)}</b></td><td><b>{pct.toFixed(1)}%</b></td><td><b>{grade(pct)}</b></td><td className="text-[13px] font-black">{card!.position ? `Position in class: ${card!.position} of ${card!.out_of}` : ""}</td></tr></tfoot>
              </table></div>
              <div className="mt-4 flex flex-wrap items-center gap-4 border-t-2 border-[#e5e7eb] pt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR code to verify this result" width={90} height={90} />
                <div className="flex-1"><div className="font-black">Verified result</div><div className="muted break-all text-[12px]">Scan to check this card at {verifyUrl.replace(/^https?:\/\//, "").split("?")[0]}</div></div>
                <div className="text-right"><div className="font-black">{card!.principal ?? ""}</div><div className="muted text-[12px]">Principal</div></div>
              </div>
            </article>
            <div className="no-print flex flex-wrap gap-2.5">
              <PrintButton />
              <a href={share} target="_blank" rel="noreferrer" className="btn" style={{ background: "#16a34a" }}>Share on WhatsApp</a>
              <span className="muted self-center text-[13px]">To download a PDF, press Print and choose &ldquo;Save as PDF&rdquo;.</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
