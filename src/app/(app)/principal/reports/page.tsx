import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { PageHead, Empty } from "@/components/ilm";
import { Tabs } from "@/components/tabs";
import { PrintButton } from "@/app/print/paper-check/[id]/print-button";
import { CATEGORIES, REPORT, REPORTS, type Report } from "@/lib/reports/catalog";
import { cell, filterQuery, readFilters, runReport, totals, visibleCols, type Filters } from "@/lib/reports/run";
import { loadOptions, type Options } from "@/lib/reports/options";
import { askReports, deleteSaved, saveView } from "./actions";

type Search = Record<string, string | undefined>;
const BASE = "/principal/reports";

// Report Center (design: Reports): every module's reports in one place, by category, with
// filters, print and CSV; plus "Ask" in plain words, saved views and an activity log.
export default async function ReportCenter({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("principal", "owner", "accountant");
  const sp = await searchParams;
  const r = sp.r ? REPORT.get(sp.r) : undefined;
  if (r && !r.link) return <ReportView r={r} sp={sp} />;
  const tab = ["ask", "saved", "log"].includes(sp.tab ?? "") ? sp.tab! : "reports";
  return (
    <>
      <PageHead kick="Reports" title="Report Center" sub="Every report the school needs, in one place. Pick one, filter it, then print or download." />
      <Tabs current={tab} tabs={[
        { id: "reports", label: `Reports ${REPORTS.length}`, href: BASE },
        { id: "ask", label: "Ask ✦", href: `${BASE}?tab=ask` },
        { id: "saved", label: "Saved", href: `${BASE}?tab=saved` },
        { id: "log", label: "Activity log", href: `${BASE}?tab=log` },
      ]} />
      {tab === "reports" && <Catalog cat={sp.cat} q={sp.q} />}
      {tab === "ask" && <Ask run={sp.run} error={sp.error} />}
      {tab === "saved" && <Saved />}
      {tab === "log" && <Log />}
    </>
  );
}

function Catalog({ cat, q }: { cat?: string; q?: string }) {
  const term = (q ?? "").trim().toLowerCase();
  const current = term ? "" : CATEGORIES.some(([id]) => id === cat) ? cat! : CATEGORIES[0][0];
  const list = REPORTS.filter((r) => term ? `${r.name} ${r.desc}`.toLowerCase().includes(term) : r.cat === current);
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <nav className="card flex shrink-0 flex-row gap-1 overflow-x-auto p-2 md:w-64 md:flex-col" aria-label="Report categories">
        {CATEGORIES.map(([id, label]) => {
          const n = REPORTS.filter((r) => r.cat === id).length;
          return (
            <Link key={id} href={`${BASE}?cat=${id}`} scroll={false} aria-current={id === current ? "true" : undefined}
              className={`flex min-h-10 shrink-0 items-center justify-between gap-3 rounded-xl px-3 text-[14px] font-extrabold whitespace-nowrap ${id === current ? "bg-[#e0f2fe] text-[#0369a1]" : "text-[#374151] hover:bg-[#f8fafc]"}`}>
              <span>{label}</span><span className="text-[12px] text-[#9ca3af]">{n}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <form className="flex gap-2" action={BASE}>
          <input className="input flex-1" name="q" defaultValue={q ?? ""} placeholder="Search reports, e.g. defaulters, toppers, van" aria-label="Search reports" />
          <button className="btn-ghost" type="submit">Search</button>
        </form>
        {term && <p className="muted text-sm">{list.length} report{list.length === 1 ? "" : "s"} match &quot;{q}&quot;.</p>}
        <section className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
          {list.map((r) => (
            <Link key={r.id} href={r.link ?? `${BASE}?r=${r.id}`} className="card flex flex-col gap-1.5 hover:border-[#7dd3fc]">
              <span className="flex items-center gap-2 font-black"><DocIcon />{r.name}</span>
              <span className="muted text-[13px]">{r.desc}</span>
            </Link>
          ))}
        </section>
        {list.length === 0 && <Empty>No report matches. Try the Ask tab.</Empty>}
      </div>
    </div>
  );
}

function DocIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 17v-3M12 17v-6M16 17v-4" /></svg>;
}

async function ReportView({ r, sp }: { r: Report; sp: Search }) {
  const supabase = await createClient();
  const f = readFilters(r, sp);
  const [opts, out] = await Promise.all([loadOptions(supabase, r), runReport(supabase, r, f)]);
  const cols = visibleCols(r, f, out.rows);
  const sum = totals(cols, out.rows);
  if (!out.error) await supabase.from("report_runs").insert({ report_id: r.id, filters: f, via: "view", row_count: out.rows.length });
  const qs = filterQuery(r, f);
  const cat = CATEGORIES.find(([id]) => id === r.cat)?.[1];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={`${BASE}?cat=${r.cat}`} className="eyebrow">‹ {cat}</Link>
          <h1 className="h1 mt-1">{r.name}</h1>
          <p className="muted mt-1 text-[15px]">{r.desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/print/report?${qs}`} target="_blank" className="btn">Print</Link>
          <a href={`/api/reports/csv?${qs}`} className="btn-ghost">Download CSV</a>
        </div>
      </div>
      {sp.saved && <div className="notice-ok">Saved. Find it on the Saved tab.</div>}
      <FilterBar r={r} f={f} opts={opts} />
      <section className="card flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">{out.rows.length.toLocaleString("en-IN")} row{out.rows.length === 1 ? "" : "s"}{out.rows.length >= 5000 ? " (first 5,000; narrow the filters)" : ""}</h2>
          <form action={saveView} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="report_id" value={r.id} /><input type="hidden" name="filters" value={JSON.stringify(f)} />
            <input className="input" style={{ minHeight: 38 }} name="name" required maxLength={80} placeholder="Name this view" aria-label="Name for this saved view" />
            <button className="btn-ghost" type="submit">Save view</button>
          </form>
        </div>
        {out.error ? <div className="notice-warn">{out.error}</div> : out.rows.length === 0 ? <Empty>Nothing found for these filters.</Empty> : (
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr>{cols.map((c) => <th key={c.k} className={num(c.t) ? "text-right" : ""}>{c.l}</th>)}</tr></thead>
            <tbody>
              {out.rows.slice(0, 1000).map((row, i) => <tr key={i}>{cols.map((c) => <td key={c.k} className={num(c.t) ? "text-right tabular-nums" : ""}>{cell(c, row[c.k])}</td>)}</tr>)}
              {sum && <tr>{sum.map((v, i) => <td key={i} className={`font-black ${i && num(cols[i].t) ? "text-right tabular-nums" : ""}`} style={{ background: "#e0f2fe" }}>{v}</td>)}</tr>}
            </tbody>
          </table></div>
        )}
        {out.rows.length > 1000 && <p className="muted text-sm">Showing the first 1,000 rows here. Print and CSV have all {out.rows.length.toLocaleString("en-IN")}.</p>}
      </section>
      <div className="flex justify-end"><PrintButton /></div>
    </>
  );
}

const num = (t?: string) => t === "money" || t === "int" || t === "pct" || t === "num";

function FilterBar({ r, f, opts }: { r: Report; f: Filters; opts: Options }) {
  const has = (k: string) => r.filters?.includes(k as never);
  if (!r.filters?.length) return null;
  const sel = (name: keyof Options, label: string, all: string) => (
    <label className="field">{label}
      <select className="input" name={name} defaultValue={f[name] ?? ""}>
        <option value="">{all}</option>
        {(opts[name] ?? []).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
      </select>
    </label>
  );
  return (
    <form className="card flex flex-row flex-wrap items-end gap-2.5" action={BASE}>
      <input type="hidden" name="r" value={r.id} />
      {has("dates") && <><label className="field">From<input className="input" type="date" name="from" defaultValue={f.from ?? ""} /></label><label className="field">To<input className="input" type="date" name="to" defaultValue={f.to ?? ""} /></label></>}
      {has("day") && <label className="field">Date<input className="input" type="date" name="to" defaultValue={f.to ?? ""} /></label>}
      {has("month") && <label className="field">Month<input className="input" type="month" name="month" defaultValue={f.month?.slice(0, 7) ?? ""} /></label>}
      {has("exam") && sel("exam", "Exam", "Choose an exam")}
      {has("class") && sel("class", "Class", "All classes")}
      {has("section") && sel("section", "Section", "All sections")}
      {has("route") && sel("route", "Route", "All routes")}
      {has("van") && sel("van", "Vehicle", "All vehicles")}
      {has("category") && sel("category", "Category", "All categories")}
      {has("gender") && <label className="field">Gender<select className="input" name="gender" defaultValue={f.gender ?? ""}><option value="">Boys and girls</option><option value="male">Boys</option><option value="female">Girls</option></select></label>}
      {has("status") && r.status && <label className="field">{r.status.label}<select className="input" name="status" defaultValue={f.status ?? ""}><option value="">All</option>{r.status.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
      {has("days") && <label className="field">{r.id === "documents-expiring" ? "Within days" : "Older than days"}<input className="input w-24" type="number" min={0} name="days" defaultValue={f.days ?? (r.id === "documents-expiring" ? "30" : "7")} /></label>}
      {has("min") && <label className="field">{r.id === "fee-defaulters" ? "Due at least (Rs)" : "At least"}<input className="input w-28" type="number" min={0} name="min" defaultValue={f.min ?? (r.id === "fee-defaulters" ? "" : "3")} /></label>}
      {has("top") && <label className="field">How many<input className="input w-20" type="number" min={1} max={200} name="top" defaultValue={f.top ?? "20"} /></label>}
      <button className="btn" type="submit">Show</button>
      <Link href={`${BASE}?r=${r.id}`} className="btn-ghost">Reset</Link>
    </form>
  );
}

async function Ask({ run, error }: { run?: string; error?: string }) {
  const supabase = await createClient();
  const [{ data: cur }, { data: past }] = await Promise.all([
    run ? supabase.from("report_runs").select("id, report_id, filters, question, answer, row_count, created_at").eq("id", run).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("report_runs").select("id, question, report_id, created_at").eq("via", "ask").order("created_at", { ascending: false }).limit(8),
  ]);
  const rr = cur?.report_id ? REPORT.get(cur.report_id) : undefined;
  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_2fr] xl:items-start">
      <section className="card flex flex-col gap-3">
        <h2 className="h2">Ask about your school</h2>
        <p className="muted text-sm">Ask in English, Urdu or Roman Urdu. The answer comes from the Report Center, with only what you are allowed to see. Phone numbers and CNICs are never sent to the AI.</p>
        <form action={askReports} className="flex flex-col gap-2">
          <textarea className="input min-h-24" name="question" required maxLength={400} defaultValue={cur?.question ?? ""} placeholder="e.g. Which families owe more than Rs 20,000? / Class 9 mein kitne bachay 5 din se zyada ghair hazir rahe is mahine?" />
          <div className="flex flex-wrap gap-2">
            <button className="btn" type="submit">Ask</button>
            {["Who are the top 10 in the last exam?", "Is mahine fee kitni aayi, cash aur JazzCash?", "Which sections have not marked attendance?", "Kaun se bachay school chor gaye is saal?"].map((s) => (
              <button key={s} className="btn-ghost" name="suggest" value={s} type="submit" style={{ minHeight: 36, fontSize: 13 }}>{s}</button>
            ))}
          </div>
        </form>
        {error && <div className="notice-warn">{error}</div>}
        {cur && (
          <div className="flex flex-col gap-2 rounded-[14px] border-2 border-[#7dd3fc] bg-[#f0f9ff] p-4">
            <div className="kick">Answer</div>
            <div className="text-[15px] font-bold whitespace-pre-line">{cur.answer}</div>
            {rr && <Link href={`${BASE}?${filterQuery(rr, cur.filters as Filters)}`} className="btn self-start">Open “{rr.name}” ({cur.row_count ?? 0} rows)</Link>}
          </div>
        )}
      </section>
      <section className="card flex flex-col gap-2">
        <h2 className="h2">Recent questions</h2>
        {(past ?? []).length === 0 && <p className="muted">Nothing asked yet.</p>}
        {(past ?? []).map((p) => (
          <Link key={p.id} href={`${BASE}?tab=ask&run=${p.id}`} className="rounded-xl border-2 border-[#f1f5f9] p-2.5 font-bold hover:border-[#7dd3fc]">
            {p.question}<span className="muted block text-xs">{REPORT.get(p.report_id)?.name ?? ""} · {new Date(p.created_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}

async function Saved() {
  const supabase = await createClient();
  const { data } = await supabase.from("report_saved").select("id, name, report_id, filters, created_at").order("created_at", { ascending: false });
  if (!data?.length) return <Empty>No saved views yet. Open a report, set the filters and press “Save view”.</Empty>;
  return (
    <section className="card flex flex-col gap-1">
      {data.map((s) => {
        const r = REPORT.get(s.report_id);
        if (!r) return null;
        return (
          <div key={s.id} className="flex flex-wrap items-center gap-2.5 border-t-2 border-[#f1f5f9] py-2.5 first:border-0">
            <Link href={`${BASE}?${filterQuery(r, s.filters as Filters)}`} className="min-w-0 flex-1 font-black underline-offset-2 hover:underline">{s.name}<span className="muted block text-xs font-bold">{r.name}</span></Link>
            <a href={`/api/reports/csv?${filterQuery(r, s.filters as Filters)}`} className="btn-ghost" style={{ minHeight: 36 }}>CSV</a>
            <form action={deleteSaved}><input type="hidden" name="id" value={s.id} /><button className="btn-ghost" style={{ minHeight: 36 }} type="submit">Remove</button></form>
          </div>
        );
      })}
    </section>
  );
}

async function Log() {
  const supabase = await createClient();
  const { data } = await supabase.from("report_runs").select("id, report_id, via, row_count, question, created_at, profiles(full_name)").order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as unknown as { id: string; report_id: string; via: string; row_count: number | null; question: string | null; created_at: string; profiles: { full_name: string } | null }[];
  if (!rows.length) return <Empty>No report has been opened yet.</Empty>;
  const VIA: Record<string, string> = { view: "Opened", csv: "Downloaded CSV", print: "Printed", ask: "Asked" };
  return (
    <section className="card overflow-x-auto">
      <table className="tbl">
        <thead><tr><th>When</th><th>Who</th><th>Report</th><th>What</th><th className="text-right">Rows</th></tr></thead>
        <tbody>{rows.map((x) => (
          <tr key={x.id}>
            <td className="whitespace-nowrap">{new Date(x.created_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
            <td>{x.profiles?.full_name ?? ""}</td>
            <td>{REPORT.get(x.report_id)?.name ?? x.report_id}{x.question ? <span className="muted block text-xs">“{x.question}”</span> : null}</td>
            <td>{VIA[x.via] ?? x.via}</td>
            <td className="text-right tabular-nums">{x.row_count ?? ""}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}
