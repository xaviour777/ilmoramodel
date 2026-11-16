import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate, todayPK } from "@/lib/format";
import { NoticeWriter } from "@/components/notice-writer";
import { PageHead, Empty, Row } from "@/components/ilm";
import { addHoliday, addPublicHolidays, createNotice, deleteHoliday, deleteNotice } from "../actions";

const AUD: Record<string, string> = { everyone: "Everyone", staff: "Staff only", parents: "Parents and students", class: "One class", section: "One section" };
const HOLIDAY_KIND: Record<string, [string, string]> = {
  holiday: ["Holiday", "var(--orange-soft)"],
  vacation: ["Vacation", "var(--green-soft)"],
  event: ["School event", "var(--purple-soft)"],
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type Holiday = { id: string; title: string; starts_on: string; ends_on: string; kind: string; note: string | null };

// "2026-11" → the month after or before it
const shiftMonth = (m: string, by: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; month?: string }> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const first = `${month}-01`;
  const last = `${shiftMonth(month, 1)}-01`;
  const [{ data: notices }, { data: classes }, { data: sections }, { data: monthHolidays }, { data: upcoming }] = await Promise.all([
    supabase.from("notices").select("*, classes(name), sections(name, classes(name))").order("created_at", { ascending: false }).limit(50),
    supabase.from("classes").select("id, name").order("sort"),
    supabase.from("sections").select("id, name, classes(name)"),
    supabase.from("holidays").select("id, title, starts_on, ends_on, kind, note").lt("starts_on", last).gte("ends_on", first).order("starts_on"),
    supabase.from("holidays").select("id, title, starts_on, ends_on, kind, note").gte("ends_on", today).order("starts_on").limit(12),
  ]);

  // the month grid, Monday first, with blanks before the 1st
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const lead = (new Date(first + "T00:00:00Z").getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const on = (d: string) => ((monthHolidays ?? []) as Holiday[]).filter((h) => h.starts_on <= d && h.ends_on >= d);
  const closedDays = cells.filter((d, i) => d && i % 7 !== 6 && on(d).some((h) => h.kind !== "event")).length;
  const title = new Date(first + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const phones = sp.saved?.startsWith("phones-") ? sp.saved.split("-").slice(1).map(Number) : null;

  const tone: Record<string, string> = { everyone: "", staff: "b", parents: "g", class: "v", section: "v" };
  return (
    <>
      <PageHead kick="School · Notices" title="Notices and holidays" sub="One message to the whole school, staff or a single class. It shows in everyone's app and can go to parents on WhatsApp or SMS." />
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {phones && (
        <div className="notice-ok">
          Published. {phones[2] ? `${phones[2]} WhatsApp or SMS messages sent.` : ""}
          {phones[0] - (phones[2] ?? 0) > 0 ? ` ${phones[0] - (phones[2] ?? 0)} are waiting in the ` : " See the "}<Link href="/accounts/messages" className="underline">outbox</Link>.
          {phones[1] > 0 ? ` ${phones[1]} families have no mobile number.` : ""}
        </div>
      )}
      {sp.saved && !phones && <div className="notice-ok">Saved.</div>}

      <section className="flex flex-wrap items-start gap-5">
        <form action={createNotice} className="card flex min-w-0 flex-[3_1_480px] flex-col gap-3">
          <div className="flex items-center justify-between gap-2"><h2 className="h2">Write a notice</h2><span className="tagx b">AI assisted</span></div>
          <NoticeWriter />
          <label className="field">Title<input className="input" name="title" required placeholder="School closed tomorrow due to smog" /></label>
          <label className="field">Message<textarea className="input min-h-28 py-3" name="body" required /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">Who sees it<select className="input" name="audience">{Object.entries(AUD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="field">Class or section
              <select className="input" name="target">
                <option value="">All classes</option>
                <optgroup label="Classes">{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                <optgroup label="Sections">{((sections ?? []) as unknown as { id: string; name: string; classes: { name: string } }[]).map((x) => <option key={x.id} value={x.id}>{x.classes.name}-{x.name}</option>)}</optgroup>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2.5 text-[14px] font-extrabold"><input type="checkbox" name="send_phone" className="h-5 w-5" /> Also send on WhatsApp / SMS to parents who don&apos;t open the app</label>
          <div className="flex justify-end"><button className="btn" type="submit">Publish notice</button></div>
        </form>
        <div className="card min-w-0 flex-[2_1_320px]">
          <h2 className="h2">Published</h2>
          {(notices ?? []).length === 0 && <div className="mt-2"><Empty>No notices yet.</Empty></div>}
          {(notices ?? []).map((n) => (
            <form key={n.id} action={deleteNotice}>
              <Row>
                <input type="hidden" name="notice_id" value={n.id} />
                <div className="min-w-0 flex-1">
                  <div className="font-black">{n.title}</div>
                  <div className="muted line-clamp-2 text-[12px]">{n.body}</div>
                  <div className="muted text-[11px]">{shortDate(n.created_at.slice(0, 10))} · <button className="underline" type="submit">Delete</button></div>
                </div>
                <span className={`tagx ${tone[n.audience] ?? ""}`}>{n.audience === "class" ? n.classes?.name : n.audience === "section" ? `${n.sections?.classes?.name}-${n.sections?.name}` : AUD[n.audience]}</span>
              </Row>
            </form>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-start gap-5">
        <div className="card flex min-w-0 flex-[3_1_480px] flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">{title}</h2>
            <div className="flex gap-2">
              <Link href={`/principal/notices?month=${shiftMonth(month, -1)}`} className="btn-ghost" style={{ minHeight: 36, padding: "0 12px" }} aria-label="Previous month">‹</Link>
              <Link href={`/principal/notices?month=${today.slice(0, 7)}`} className="btn-ghost" style={{ minHeight: 36, padding: "0 12px", fontSize: 12 }}>Today</Link>
              <Link href={`/principal/notices?month=${shiftMonth(month, 1)}`} className="btn-ghost" style={{ minHeight: 36, padding: "0 12px" }} aria-label="Next month">›</Link>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((d) => <div key={d} className="kick py-1">{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} />;
              const hs = on(d);
              const sunday = i % 7 === 6;
              return (
                <div key={d} title={hs.map((h) => h.title).join(", ") || undefined}
                  className="flex min-h-16 min-w-0 flex-col items-start gap-0.5 rounded-xl border-2 p-1.5 text-left"
                  style={{ borderColor: d === today ? "#7dd3fc" : hs[0] ? "transparent" : "#eef2f7", background: hs[0] ? HOLIDAY_KIND[hs[0].kind][1] : sunday ? "#f8fafc" : "#fff" }}>
                  <span className="text-sm font-black" style={sunday ? { color: "#9ca3af" } : undefined}>{Number(d.slice(8))}</span>
                  {hs.map((h) => <span key={h.id} className="line-clamp-2 break-words text-[10px] font-extrabold leading-tight md:text-[11px]">{h.title}</span>)}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="muted text-[13px]">{closedDays ? `${closedDays} school day${closedDays === 1 ? "" : "s"} off this month, besides Sundays.` : "No holidays this month."}</p>
            <div className="flex flex-wrap gap-3 text-xs font-bold">
              {Object.values(HOLIDAY_KIND).map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded" style={{ background: c }} />{l}</span>)}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
          <div className="card flex flex-col gap-3">
            <form action={addHoliday} className="flex flex-col gap-3">
              <h2 className="h2">Add a holiday</h2>
              <label className="field">Name<input className="input" name="title" required placeholder="Eid-ul-Fitr, Sports day" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field">First day<input className="input" type="date" name="starts_on" required /></label>
                <label className="field">Last day<input className="input" type="date" name="ends_on" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="field">Kind<select className="input" name="kind">{Object.entries(HOLIDAY_KIND).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="field">Note (optional)<input className="input" name="note" placeholder="Opens Monday" /></label>
              </div>
              <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="announce" defaultChecked className="h-5 w-5" /> Post it as a notice</label>
              <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="send_phone" className="h-5 w-5" /> Also send to every parent on WhatsApp or SMS</label>
              <button className="btn" type="submit">Add to calendar</button>
            </form>
            <form action={addPublicHolidays}>
              <button className="btn-ghost w-full" type="submit" title="Kashmir Day, Pakistan Day, Labour Day, Youm-e-Takbeer, Independence Day, Iqbal Day and Quaid-e-Azam Day for the next 12 months">Add Pakistan&apos;s public holidays</button>
            </form>
            <p className="muted text-[12px]">Fixed-date holidays for 12 months. Add Eid, Ashura and 12 Rabi-ul-Awwal once the dates are announced.</p>
          </div>
          <div className="card">
            <h2 className="h2">Coming up</h2>
            {(upcoming ?? []).length === 0 && <div className="mt-2"><Empty>No holidays planned yet.</Empty></div>}
            {((upcoming ?? []) as Holiday[]).map((h) => (
              <form key={h.id} action={deleteHoliday}>
                <Row>
                  <input type="hidden" name="holiday_id" value={h.id} /><input type="hidden" name="month" value={month} />
                  <div className="min-w-0 flex-1"><div className="font-black">{h.title}</div>
                    <div className="muted text-[12px]">{HOLIDAY_KIND[h.kind][0]}{h.note ? ` · ${h.note}` : ""} · <button className="underline" type="submit">Remove</button></div></div>
                  <span className="kick">{h.starts_on === h.ends_on ? shortDate(h.starts_on) : `${shortDate(h.starts_on)} – ${shortDate(h.ends_on)}`}</span>
                </Row>
              </form>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
