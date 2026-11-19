import Link from "next/link";
import { requireRole } from "@/lib/me";
import { loadGroup, qs, type OwnerSearch } from "@/lib/owner";
import { REPORTS } from "@/lib/owner-reports";
import { OwnerFilter, OwnerHead } from "@/components/owner-ui";
import { scheduleReport } from "../actions";

export default async function Reports({ searchParams }: { searchParams: Promise<OwnerSearch & { saved?: string; error?: string }> }) {
  await requireRole("owner");
  const sp = await searchParams;
  const g = await loadGroup(sp);
  const { data: sched } = await g.supabase.from("report_schedules").select("id, report, frequency, send_to, created_at").order("created_at");
  const q = qs({ c: sp.c, p: sp.p }, {});
  return (
    <>
      <OwnerHead group="Admin" title="Reports" sub="Every report follows the campus and period you choose. PDF opens a print page; Excel downloads a CSV file." />
      {sp.error && <div className="notice-bad">{sp.error}</div>}{sp.saved && <div className="notice-ok">Saved.</div>}
      <OwnerFilter base="/owner/reports" sp={sp} all={g.all} camp={g.camp} period={g.period} />
      <div className="grid gap-3 md:grid-cols-2">
        {REPORTS.map((r) => (
          <div key={r.id} className="card flex-row flex-wrap items-center gap-3">
            <div className="min-w-48 flex-1"><div className="text-[16px] font-black">{r.title}</div><div className="muted text-sm">{r.sub}</div></div>
            <Link className="btn-ghost min-h-10 px-3 text-sm" target="_blank" href={`/print/owner/${r.id}${q}`}>PDF</Link>
            <a className="btn-ghost min-h-10 px-3 text-sm" href={`/api/owner/report/${r.id}${q}`}>Excel</a>
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <form action={scheduleReport} className="card">
          <input type="hidden" name="back" value="/owner/reports" />
          <h2 className="h2">Schedule a report</h2>
          <label className="field">Report<select className="input" name="report">{REPORTS.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
          <label className="field">How often<select className="input" name="frequency"><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="termly">Every term</option></select></label>
          <label className="field">Send to (email or WhatsApp)<input className="input" name="send_to" placeholder="owner@school.pk" /></label>
          <button className="btn self-start" type="submit">Save schedule</button>
          <p className="muted text-xs">Schedules are saved here. Sending them out by email or WhatsApp isn&apos;t switched on yet, so open them from this page meanwhile.</p>
        </form>
        <section className="card">
          <h2 className="h2">Scheduled</h2>
          {(sched ?? []).length === 0 && <p className="muted">None yet.</p>}
          {(sched ?? []).map((s) => (
            <form key={s.id} action={scheduleReport} className="flex items-center justify-between gap-2 border-t-2 py-2 text-sm font-bold" style={{ borderColor: "#f1f5f9" }}>
              <input type="hidden" name="remove" value={s.id} /><input type="hidden" name="back" value="/owner/reports" />
              <span>{REPORTS.find((r) => r.id === s.report)?.title ?? s.report} · {s.frequency}{s.send_to ? ` · ${s.send_to}` : ""}</span>
              <button className="muted underline" type="submit">Remove</button>
            </form>
          ))}
        </section>
      </div>
    </>
  );
}
