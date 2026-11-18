import Link from "next/link";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { pct, rupees, todayPK } from "@/lib/format";
import { aiStatus } from "@/lib/ai";
import { Chips, Row } from "@/components/ilm";
import { AI_CATEGORIES, AI_FEATURES } from "@/lib/ai-features";
import { toggleAiFeature } from "./actions";

const DAY = 864e5;

// The AI feature catalog (design/AITools.dc.html): what AI can do, with an example from this school's own data.
export default async function PrincipalAiTools({ searchParams }: { searchParams: Promise<{ cat?: string; sel?: string; error?: string }> }) {
  await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayPK();
  const monthStart = today.slice(0, 8) + "01";
  const d21 = new Date(Date.parse(today) - 20 * DAY).toISOString().slice(0, 10);
  const [{ data: settings }, status, usage, sheets, tutor, papers, bank, absent, owing, leave, adm, unmarked, notices, msgs] = await Promise.all([
    supabase.from("campus_settings").select("ai_features").maybeSingle(),
    aiStatus(supabase),
    supabase.from("ai_usage").select("cost_usd, feature").gte("at", monthStart + "T00:00:00"),
    supabase.from("paper_sheets").select("status").in("status", ["scanned", "reviewed"]).gte("scanned_at", monthStart + "T00:00:00"),
    supabase.from("tutor_sessions").select("is_stuck, topic").gte("created_at", new Date(Date.parse(today) - 7 * DAY).toISOString()),
    supabase.from("question_papers").select("id", { count: "exact", head: true }),
    supabase.from("question_bank").select("id", { count: "exact", head: true }),
    supabase.from("attendance").select("student_id").eq("status", "absent").gte("date", d21).limit(5000),
    supabase.from("family_balances").select("balance_paisa").gt("balance_paisa", 0),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "approved").lte("from_on", today).gte("to_on", today),
    supabase.from("admissions").select("id, created_at").in("status", ["inquiry", "test", "offered"]),
    supabase.from("sections").select("id, slots:timetable_slots(count)"),
    supabase.from("notices").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
    supabase.from("messages").select("channel").gte("created_at", monthStart),
  ]);
  const on = (id: string) => ((settings?.ai_features ?? {}) as Record<string, boolean>)[id] !== false;
  const cost = (usage.data ?? []).reduce((t, u) => t + Number(u.cost_usd ?? 0), 0);
  const checked = (sheets.data ?? []).length;
  const absN = new Map<string, number>(); for (const a of absent.data ?? []) absN.set(a.student_id, (absN.get(a.student_id) ?? 0) + 1);
  const atRisk = [...absN.values()].filter((n) => n >= 3).length;
  const owe = owing.data ?? [];
  const stale = (adm.data ?? []).filter((a) => Date.parse(a.created_at) < Date.now() - 7 * DAY).length;
  const noTT = ((unmarked.data ?? []) as unknown as { slots: { count: number }[] }[]).filter((s) => !s.slots?.[0]?.count).length;
  const stuck = (tutor.data ?? []).filter((t) => t.is_stuck);
  const topTopic = [...stuck.reduce((m, t) => m.set(t.topic, (m.get(t.topic) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0];
  const wa = (msgs.data ?? []).filter((m) => m.channel === "whatsapp").length;
  // an example for each feature, from this school's own numbers (or what's missing)
  const EX: Record<string, string> = {
    brief: `Today: ${atRisk} students absent 3+ times in 3 weeks, ${owe.length} families with a balance, ${(adm.data ?? []).length} admissions open.`,
    ask: "Try: \"Which section has the lowest attendance this month?\" The answer comes from Reports.",
    risk: atRisk ? `${atRisk} students absent 3 or more times in the last 3 weeks.` : "No student is absent 3+ times in the last 3 weeks.",
    plan: "Open any section in Classes: its \"What to do this week\" list comes from its own numbers.",
    paper: checked ? `${checked} papers checked this month, about ${Math.round((checked * 8) / 60)} teacher hours saved.` : "No papers checked yet this month.",
    qpaper: `${papers.count ?? 0} question papers made; ${(bank.count ?? 0).toLocaleString("en-IN")} questions in the bank.`,
    tt: noTT ? `${noTT} sections have no timetable yet: fill them in one go.` : "Every section has a timetable.",
    sub: leave.count ? `${leave.count} teacher${leave.count === 1 ? " is" : "s are"} on leave today: see who is free in each period.` : "No teacher on leave today.",
    tutor: stuck.length ? `${stuck.length} times this week students needed the full answer${topTopic ? `, most on "${topTopic[0]}"` : ""}.` : "No student got stuck with the tutor this week.",
    homework: `${(tutor.data ?? []).length} homework questions asked this week.`,
    notice: `${notices.count ?? 0} notices sent this month.`,
    remind: owe.length ? `${owe.length} families owe ${rupees(owe.reduce((t, o) => t + Number(o.balance_paisa), 0))}; ${wa} WhatsApp messages sent this month.` : "No family owes anything right now.",
    fee: "See this month's fees still to come against salaries due on the Fees overview.",
    seat: "Classes → Classrooms shows empty seats and each room's profit once rooms are added.",
    adm: stale ? `${stale} open inquiries are older than 7 days without being admitted or declined.` : `${(adm.data ?? []).length} admissions open, none older than a week.`,
    board: "Exams → Board prep predicts the board average from this session's published tests.",
  };
  const cat = AI_CATEGORIES.some(([k]) => k === sp.cat) ? sp.cat! : "all";
  const feats = AI_FEATURES.filter((f) => cat === "all" || f.cat === cat);
  const sel = AI_FEATURES.find((f) => f.id === sp.sel) ?? feats[0];
  const onCount = AI_FEATURES.filter((f) => on(f.id)).length;
  const budget = status?.daily_budget ?? 0, spent = status?.spent_today ?? 0;

  return (
    <>
      <section className="card flex flex-row flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-[1_1_360px]">
          <div className="kick">AI for your school</div>
          <h1 className="h1 mt-1">What AI can do for your school</h1>
          <p className="muted mt-1.5 text-[15px]">{AI_FEATURES.length} jobs AI can do, sorted by who it helps. Pick one to see what it does, then turn it on or off. AI only suggests; a person always approves before anything reaches parents.</p>
        </div>
        <div className="grid flex-[1_1_320px] grid-cols-2 gap-2.5">
          {[[checked ? `${Math.round((checked * 8) / 60)} hrs` : "0 hrs", "teacher time saved this month"], [`${onCount} on`, `of ${AI_FEATURES.length} features`],
            [`$${cost.toFixed(2)}`, "AI cost this month"], [budget ? `$${spent.toFixed(2)} / $${budget}` : "No limit set", "spent today / daily limit"]].map(([v, l]) => (
            <div key={l} className="rounded-[14px] border-2 border-[#e5e7eb] p-3"><div className="text-[20px] font-black">{v}</div><div className="muted text-[12px]">{l}</div></div>
          ))}
        </div>
      </section>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {status && !status.ready && <div className="notice-warn">AI is not switched on yet: add a key in <Link className="underline" href="/settings/ai">Settings → AI</Link>. Features marked On will work once it is.</div>}
      {budget > 0 && spent >= budget && <div className="notice-bad">Today&apos;s AI limit of ${budget} is used up. AI features pause until tomorrow; change the limit in Settings → AI.</div>}
      <Chips label="Category" current={cat} items={AI_CATEGORIES.map(([k, l]) => ({ id: k, label: l, href: `/principal/ai${k === "all" ? "" : `?cat=${encodeURIComponent(k)}`}` }))} />
      <section className="flex flex-wrap items-start gap-5">
        <div className="grid min-w-0 flex-[3_1_520px] gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
          {feats.map((f) => (
            <Link key={f.id} href={`/principal/ai?${new URLSearchParams({ ...(cat !== "all" ? { cat } : {}), sel: f.id })}`} scroll={false} aria-current={f.id === sel?.id ? "true" : undefined}
              className={`card flex flex-col gap-1.5 ${f.id === sel?.id ? "!border-[#7dd3fc] !bg-[#f0f9ff] !shadow-[0_4px_0_#7dd3fc]" : "hover:border-[#cbd5e1]"}`}>
              <div className="flex items-center justify-between"><span className={`ilm-tile ${f.tile} font-black`}>{f.name[0]}</span>
                <span className={`tagx ${on(f.id) ? "g" : "v"}`}>{on(f.id) ? "On" : "Off"}</span></div>
              <span className="font-black">{f.name}</span><span className="muted text-[13px]">{f.short}</span><span className="text-[12px] font-extrabold text-[#15803d]">{f.win}</span>
            </Link>
          ))}
        </div>
        {sel && (
          <aside className="card flex min-w-0 flex-[2_1_340px] flex-col gap-3">
            <div className="flex items-center gap-3"><span className={`ilm-tile ${sel.tile} text-[20px] font-black`} style={{ width: 48, height: 48, borderRadius: 14 }}>{sel.name[0]}</span>
              <div><div className="kick">{sel.cat} · lives in {sel.where}</div><h2 className="h2">{sel.name}</h2></div></div>
            <p className="text-[14px] font-bold">{sel.long}</p>
            <div className="rounded-[14px] bg-[#f8fafc] p-3"><div className="kick">From your school</div><p className="mt-1 text-[14px] font-bold">{EX[sel.id]}</p></div>
            <Row><span className="flex-1 font-bold">Saves</span><span className="font-black">{sel.saves}</span></Row>
            <Row><span className="flex-1 font-bold">Who approves</span><span className="font-black">{sel.approver}</span></Row>
            <Row><span className="flex-1 font-bold">Status</span><span className={`tagx ${on(sel.id) ? "g" : "v"}`}>{on(sel.id) ? "On" : "Off"}</span></Row>
            <div className="flex flex-wrap gap-2.5">
              <form action={toggleAiFeature}><input type="hidden" name="feature" value={sel.id} /><input type="hidden" name="on" value={on(sel.id) ? "0" : "1"} /><input type="hidden" name="cat" value={cat === "all" ? "" : cat} />
                <button className={on(sel.id) ? "btn-ghost" : "btn"} type="submit">{on(sel.id) ? "Turn off" : "Turn on"}</button></form>
              <Link href={sel.href} className="btn-ghost">Open {sel.where}</Link>
            </div>
            <p className="muted text-[12px]">Spending: {budget ? `the daily limit of $${budget} applies to every AI feature; ${pct(Math.min(1, spent / budget))} used today.` : "no daily limit set yet."} <Link href="/settings/ai" className="underline">Change in Settings → AI</Link>.</p>
          </aside>
        )}
      </section>
    </>
  );
}
