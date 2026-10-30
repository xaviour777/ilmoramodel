import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate, todayPK } from "@/lib/format";
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

  return (
    <>
      <div>
        <h1 className="h1">Notices and holidays</h1>
        <p className="muted text-base">One message to the whole school, staff, or a single class. It shows in everyone&apos;s app, and can go to parents on WhatsApp or SMS.</p>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {phones && (
        <div className="notice-ok">
          Published. {phones[2] ? `${phones[2]} WhatsApp or SMS messages sent.` : ""}
          {phones[0] - (phones[2] ?? 0) > 0 ? ` ${phones[0] - (phones[2] ?? 0)} are waiting in the ` : " See the "}<Link href="/accounts/messages" className="underline">outbox</Link>.
          {phones[1] > 0 ? ` ${phones[1]} families have no mobile number.` : ""}
        </div>
      )}
      {sp.saved && !phones && <div className="notice-ok">Saved.</div>}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <section className="card flex-[2]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2">Holiday calendar · {title}</h2>
            <div className="flex gap-2">
              <Link href={`/principal/notices?month=${shiftMonth(month, -1)}`} className="btn-ghost min-h-10 px-3 text-sm" aria-label="Previous month">‹</Link>
              <Link href={`/principal/notices?month=${today.slice(0, 7)}`} className="btn-ghost min-h-10 px-3 text-sm">Today</Link>
              <Link href={`/principal/notices?month=${shiftMonth(month, 1)}`} className="btn-ghost min-h-10 px-3 text-sm" aria-label="Next month">›</Link>
            </div>
          </div>
          <p className="muted">{closedDays ? `${closedDays} school days off this month, besides Sundays.` : "No holidays this month."}</p>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((d) => <div key={d} className="py-1 text-[11px] font-black uppercase tracking-wider" style={{ color: "var(--muted)" }}>{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} />;
              const hs = on(d);
              const sunday = i % 7 === 6;
              return (
                <div key={d} title={hs.map((h) => h.title).join(", ") || undefined}
                  className="flex min-h-16 min-w-0 flex-col items-start gap-0.5 rounded-xl border-2 p-1.5 text-left"
                  style={{
                    borderColor: d === today ? "var(--blue-ring)" : "var(--line)",
                    background: hs[0] ? HOLIDAY_KIND[hs[0].kind][1] : sunday ? "var(--page)" : "#fff",
                  }}>
                  <span className="text-sm font-black" style={sunday ? { color: "var(--muted)" } : undefined}>{Number(d.slice(8))}</span>
                  {hs.map((h) => <span key={h.id} className="line-clamp-2 break-words text-[10px] font-extrabold leading-tight md:text-[11px]">{h.title}</span>)}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-bold">
            {Object.values(HOLIDAY_KIND).map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded" style={{ background: c }} />{l}</span>)}
          </div>

          <h3 className="mt-2 text-lg font-black">Coming up</h3>
          {(upcoming ?? []).length === 0 && <p className="muted">No holidays planned yet.</p>}
          {((upcoming ?? []) as Holiday[]).map((h) => (
            <form key={h.id} action={deleteHoliday} className="row-box">
              <input type="hidden" name="holiday_id" value={h.id} /><input type="hidden" name="month" value={month} />
              <span className="pill pill-gray">{HOLIDAY_KIND[h.kind][0]}</span>
              <div className="min-w-0 flex-1">
                <b>{h.title}</b>
                <div className="muted text-xs">{h.starts_on === h.ends_on ? shortDate(h.starts_on) : `${shortDate(h.starts_on)} to ${shortDate(h.ends_on)}`}{h.note ? ` · ${h.note}` : ""}</div>
              </div>
              <button className="muted text-xs underline" type="submit">Remove</button>
            </form>
          ))}
        </section>

        <div className="flex flex-1 flex-col gap-5 xl:max-w-[420px]">
          <form action={addHoliday} className="card">
            <h2 className="h2">Add a holiday</h2>
            <label className="field">Name<input className="input" name="title" required placeholder="Eid-ul-Fitr, Summer vacation, Sports day" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">First day<input className="input" type="date" name="starts_on" required /></label>
              <label className="field">Last day<input className="input" type="date" name="ends_on" /></label>
            </div>
            <label className="field">Kind<select className="input" name="kind">{Object.entries(HOLIDAY_KIND).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field">Note for parents (optional)<input className="input" name="note" placeholder="School opens again on Monday" /></label>
            <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="announce" defaultChecked className="h-5 w-5" /> Post it as a notice in the app</label>
            <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="send_phone" className="h-5 w-5" /> Also send to every parent on WhatsApp or SMS</label>
            <button className="btn" type="submit">Add to calendar</button>
          </form>
          <form action={addPublicHolidays} className="card">
            <h2 className="h2">Public holidays</h2>
            <p className="muted">Adds Pakistan&apos;s fixed-date holidays for the next 12 months: Kashmir Day, Pakistan Day, Labour Day, Youm-e-Takbeer, Independence Day, Iqbal Day and Quaid-e-Azam Day. Add Eid, Ashura and 12 Rabi-ul-Awwal yourself once the dates are announced.</p>
            <button className="btn-ghost" type="submit">Add public holidays</button>
          </form>
        </div>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <form action={createNotice} className="card xl:w-[420px]">
          <h2 className="h2">New notice</h2>
          <label className="field">Title<input className="input" name="title" required placeholder="School closed tomorrow due to smog" /></label>
          <label className="field">Message<textarea className="input min-h-28 py-3" name="body" required /></label>
          <label className="field">Who sees it<select className="input" name="audience">{Object.entries(AUD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field">Class or section (if one is chosen above)
            <select className="input" name="target">
              <option value="">None</option>
              <optgroup label="Classes">{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
              <optgroup label="Sections">{((sections ?? []) as unknown as { id: string; name: string; classes: { name: string } }[]).map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}</option>)}</optgroup>
            </select>
          </label>
          <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="send_phone" className="h-5 w-5" /> Also send to parents on WhatsApp or SMS, for those who don&apos;t open the app</label>
          <button className="btn" type="submit">Publish</button>
        </form>
        <section className="card flex-1">
          <h2 className="h2">Published</h2>
          {(notices ?? []).map((n) => (
            <form key={n.id} action={deleteNotice} className="flex flex-col gap-1.5 rounded-2xl border-2 p-3.5" style={{ borderColor: "var(--line)" }}>
              <input type="hidden" name="notice_id" value={n.id} />
              <div className="flex items-start justify-between gap-2">
                <div className="text-lg font-black">{n.title}</div>
                <span className="pill pill-blue">{n.audience === "class" ? n.classes?.name : n.audience === "section" ? `${n.sections?.classes?.name}-${n.sections?.name}` : AUD[n.audience]}</span>
              </div>
              <p className="text-sm font-semibold">{n.body}</p>
              <div className="flex justify-between"><span className="muted text-xs">{new Date(n.created_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}</span>
                <button className="muted text-xs underline" type="submit">Delete</button></div>
            </form>
          ))}
        </section>
      </div>
    </>
  );
}
