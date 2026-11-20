import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { rupees, shortDate } from "@/lib/format";
import { band, KIND_ICON, say, trendSentence, type Kid } from "@/lib/learning";
import { kidToday } from "@/lib/kid-today";

const P = (x: number) => `${Math.round(x * 100)}%`;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });

// My Child Today: what a parent needs in 30 seconds, on a cheap phone. Plain words, Urdu first.
export async function ChildToday({ kid, ur, due, challan }: { kid: Kid; ur: boolean; due: number; challan: { challan_no: string; due_on: string } | null }) {
  const t = say(ur);
  const supabase = await createClient();
  const d = await kidToday(supabase, kid);
  const first = kid.full_name.split(" ")[0];
  const STATUS: Record<string, [string, string, string, string]> = {
    present: [`${first} is in school today`, `${first} آج اسکول میں ہے`, "var(--green-soft)", "var(--green-ink)"],
    late: [`${first} came late today`, `${first} آج دیر سے آیا/آئی`, "var(--orange-soft)", "var(--orange-ink)"],
    absent: [`${first} is absent today`, `${first} آج غیر حاضر ہے`, "var(--red-soft)", "var(--red-ink)"],
    leave: [`${first} is on leave today`, `${first} آج چھٹی پر ہے`, "var(--purple-soft)", "var(--purple-ink)"],
  };
  const s = d.todayMark ? STATUS[d.todayMark] : null;
  const todayHw = d.hw.filter((h) => h.due_on === d.today || h.due_on === d.hw[0]?.due_on);
  const left = d.hw.filter((h) => !h.handedIn).length;
  const next = d.upcoming[0];
  const ach = d.items.filter((i) => i.status === "approved").slice(0, 4);
  const changes = d.subjects.filter((x) => x.previous != null).map((x) => ({ x, tr: trendSentence(x, ur) }));
  const last = d.steps[d.steps.length - 1], prev = d.steps[d.steps.length - 2];
  const tile = "flex flex-col gap-0.5 rounded-2xl border-2 p-3 text-sm font-bold";

  return (
    <div className="flex flex-col gap-4" dir={ur ? "rtl" : "ltr"} lang={ur ? "ur" : "en"}>
      <div className="rounded-2xl p-4" style={{ background: s?.[2] ?? "#f2f2f2", color: s?.[3] ?? "#4b4b4b" }}>
        <div className="text-xl font-black">{s ? t(s[0], s[1]) : t(`${first} hasn't been marked yet today`, `${first} کی آج کی حاضری ابھی نہیں لگی`)}</div>
        <div className="text-sm font-bold">{kid.sections ? `${kid.sections.classes.name}-${kid.sections.name}` : ""}{d.attendanceRate != null ? ` · ${t("came", "حاضری")} ${P(d.attendanceRate)} ${t("of school days in the last 30 days", "پچھلے 30 دنوں میں")}` : ""}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <a href="#hw" className={tile} style={{ borderColor: "var(--line)", background: "#fff" }}><span className="muted text-xs">{t("Homework", "ہوم ورک")}</span><span className="text-lg font-black">{left === 0 ? t("All done", "سب مکمل") : `${left} ${t("to do", "باقی")}`}</span></a>
        <a href="#tests" className={tile} style={{ borderColor: "var(--line)", background: "#fff" }}><span className="muted text-xs">{t("Next test", "اگلا ٹیسٹ")}</span><span className="text-lg font-black">{next ? shortDate(next.on_date) : t("None soon", "جلد نہیں")}</span>{next && <span className="text-xs">{next.subject}</span>}</a>
        <Link href="/parent/fees" className={tile} style={{ borderColor: due > 0 ? "var(--orange)" : "var(--line)", background: "#fff" }}><span className="muted text-xs">{t("Fees", "فیس")}</span><span className="text-lg font-black tabular-nums" dir="ltr">{due > 0 ? rupees(due) : t("All paid", "سب ادا")}</span></Link>
        <a href="#meet" className={tile} style={{ borderColor: "var(--line)", background: "#fff" }}><span className="muted text-xs">{t("Meetings", "ملاقاتیں")}</span><span className="text-lg font-black">{d.meetings.length ? shortDate(d.meetings[0].starts_at.slice(0, 10)) : t("None", "کوئی نہیں")}</span></a>
      </div>

      <section id="hw" className="card">
        <h2 className="h2">{t("Today's homework", "آج کا ہوم ورک")}</h2>
        {todayHw.length === 0 ? <p className="muted">{t("No homework due.", "کوئی ہوم ورک باقی نہیں۔")}</p> : todayHw.map((h) => (
          <div key={h.id} className="row-box">
            <span aria-hidden>{h.handedIn ? "✅" : "📘"}</span>
            <div className="flex-1"><div className="font-extrabold">{h.subject}: {h.title}</div>
              <div className="muted text-xs">{h.due_on === d.today ? t("Due today", "آج جمع کرانا ہے") : `${t("Due", "جمع")} ${shortDate(h.due_on)}`} · {h.checked ? t("Checked by teacher", "استاد نے چیک کر لیا") : h.handedIn ? t("Handed in", "جمع ہو گیا") : t("Not handed in yet", "ابھی جمع نہیں ہوا")}</div></div>
          </div>
        ))}
        {d.hw.length > todayHw.length && <Link href={`/parent/details?child=${kid.id}`} className="text-sm font-bold underline">{t(`${d.hw.length - todayHw.length} more later this week`, `اس ہفتے ${d.hw.length - todayHw.length} مزید`)}</Link>}
      </section>

      <section id="tests" className="card">
        <h2 className="h2">{t("Upcoming test dates", "آنے والے ٹیسٹ کی تاریخیں")}</h2>
        {d.upcoming.length === 0 ? <p className="muted">{t("No tests in the next few weeks.", "اگلے چند ہفتوں میں کوئی ٹیسٹ نہیں۔")}</p> : d.upcoming.slice(0, 5).map((u, i) => (
          <div key={i} className="flex justify-between gap-2 text-sm font-bold"><span>{u.subject} · {u.title}</span><span className="tabular-nums">{shortDate(u.on_date)}</span></div>
        ))}
      </section>

      <section className="card">
        <h2 className="h2">{t("How is my child doing?", "میرا بچہ کیسا جا رہا ہے؟")}</h2>
        {d.subjects.length === 0 ? <p className="muted">{t("This shows after the school publishes the first result.", "اسکول کا پہلا نتیجہ آنے کے بعد یہاں نظر آئے گا۔")}</p> : (
          <>
            {last && (
              <div className="rounded-xl p-3 font-bold" style={{ background: "var(--page)" }}>
                {prev
                  ? (last.r - prev.r >= 0.05 ? t(`Better than before: ${P(prev.r)} in ${prev.name}, now ${P(last.r)} in ${last.name}.`, `پہلے سے بہتر: ${prev.name} میں ${P(prev.r)}، اب ${last.name} میں ${P(last.r)}۔`)
                    : last.r - prev.r <= -0.05 ? t(`A little lower: ${P(prev.r)} in ${prev.name}, now ${P(last.r)} in ${last.name}. Extra practice at home will help.`, `تھوڑا کم: ${prev.name} میں ${P(prev.r)}، اب ${last.name} میں ${P(last.r)}۔ گھر پر تھوڑی مشق مدد کرے گی۔`)
                    : t(`Steady: about ${P(last.r)} in ${last.name}, same as ${prev.name}.`, `ایک جیسا: ${last.name} میں تقریباً ${P(last.r)}، ${prev.name} جیسا۔`))
                  : t(`${last.name}: ${P(last.r)} overall (${band(last.r, false).word}).`, `${last.name}: مجموعی ${P(last.r)} (${band(last.r, true).word})۔`)}
              </div>
            )}
            {changes.length > 0 && changes.slice(0, 6).map(({ x, tr }) => (
              <div key={x.id} className="flex items-center gap-2 text-sm font-bold">
                <span aria-hidden style={{ color: tr.dir === "up" ? "var(--green)" : tr.dir === "down" ? "var(--red)" : "var(--muted)" }}>{tr.dir === "up" ? "▲" : tr.dir === "down" ? "▼" : "●"}</span>
                <span className="flex-1">{tr.text}</span>
              </div>
            ))}
            {changes.length === 0 && d.subjects.map((x) => <div key={x.id} className="flex justify-between text-sm font-bold"><span>{x.name}</span><span>{P(x.latest)} · {band(x.latest, ur).word}</span></div>)}
          </>
        )}
        <Link href={`/parent/progress?child=${kid.id}`} className="btn-ghost self-start">{t("Practice ideas for home", "گھر کے لیے مشق کے مشورے")}</Link>
      </section>

      <section className="card">
        <h2 className="h2">{t("Teacher feedback", "استاد کی رائے")}</h2>
        {d.notes.length === 0 && d.remarks.length === 0 && <p className="muted">{t("Nothing new from the teachers.", "اساتذہ کی طرف سے کچھ نیا نہیں۔")}</p>}
        {d.notes.map((n) => <div key={n.id} className="row-box"><span aria-hidden>{n.kind === "praise" ? "👏" : "💬"}</span><span className="flex-1 text-sm font-bold">{n.note}</span><span className="muted text-xs">{shortDate(n.created_at.slice(0, 10))}</span></div>)}
        {d.remarks.map((r, i) => <div key={i} className="row-box"><span aria-hidden>📝</span><span className="flex-1 text-sm font-bold">{r.homework?.subjects?.name ? `${r.homework.subjects.name}: ` : ""}&quot;{r.remark}&quot;</span></div>)}
      </section>

      {ach.length > 0 && (
        <section className="card">
          <h2 className="h2">{t("Achievements (approved by school)", "کامیابیاں (اسکول سے منظور شدہ)")}</h2>
          {ach.map((i) => <div key={i.id} className="flex gap-2 text-sm font-bold"><span aria-hidden>{KIND_ICON[i.kind]}</span><span className="flex-1">{i.title}</span><span className="muted text-xs">{shortDate(i.happened_on)}</span></div>)}
          <Link href={`/parent/passport?child=${kid.id}`} className="text-sm font-bold underline">{t("See the Model Passport", "ماڈل پاسپورٹ دیکھیں")}</Link>
        </section>
      )}

      <section id="meet" className="card">
        <h2 className="h2">{t("Meetings with teachers", "اساتذہ سے ملاقات")}</h2>
        {d.meetings.length === 0 ? <p className="muted">{t("No meeting booked.", "کوئی ملاقات طے نہیں۔")}</p>
          : d.meetings.map((m) => <div key={m.id} className="text-sm font-bold">📅 <span dir="ltr">{when(m.starts_at)}</span> · {m.teacher?.full_name ?? ""}{m.place ? ` · ${m.place}` : ""}</div>)}
        <Link href="/parent/requests" className="btn-ghost self-start">{t("Ask for a meeting or leave", "ملاقات یا چھٹی کی درخواست")}</Link>
      </section>

      <section className="card">
        <h2 className="h2">{t("Fees", "فیس")}</h2>
        <div className="text-2xl font-black tabular-nums" dir="ltr">{due > 0 ? rupees(due) : t("All paid", "سب ادا ہو گیا")}</div>
        {challan && due > 0 && <div className="muted text-sm">{t(`Challan ${challan.challan_no}, last date ${shortDate(challan.due_on)}. Pay by JazzCash, Easypaisa or cash at the school.`, `چالان ${challan.challan_no}، آخری تاریخ ${shortDate(challan.due_on)}۔ جاز کیش، ایزی پیسہ یا اسکول میں نقد ادا کریں۔`)}</div>}
        <div className="flex flex-wrap gap-2">{due > 0 && <Link href="/parent/fees#pay" className="btn">{t("Pay now", "ابھی ادا کریں")}</Link>}<Link href="/parent/fees" className="btn-ghost">{t("Receipts", "رسیدیں")}</Link></div>
      </section>

      <Link href={`/print/child-report/${kid.id}`} target="_blank" className="btn self-start">{t("Download report (PDF)", "رپورٹ ڈاؤن لوڈ کریں (PDF)")}</Link>
    </div>
  );
}
