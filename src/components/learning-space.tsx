import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { shortDate, time } from "@/lib/format";
import { moduleOn } from "@/lib/modules";
import { band, KIND_ICON, practiceToday, say, trendSentence, type Kid } from "@/lib/learning";
import { kidToday, milestones } from "@/lib/kid-today";
import { HomeworkSubmit } from "./homework-submit";
import { Celebrate } from "./celebrate";
import { SuggestionList } from "./suggestion-list";

const TONE: Record<string, string> = { green: "var(--green)", blue: "var(--blue)", orange: "var(--orange)", red: "var(--red)" };

// My Learning Space: the student's own day, progress and journey. No rankings, no streaks.
export async function LearningSpace({ kid, ur }: { kid: Kid; ur: boolean }) {
  const t = say(ur);
  const supabase = await createClient();
  const passport = await moduleOn("passport");
  const d = await kidToday(supabase, kid);
  const tips = await practiceToday(supabase, kid, d.subjects, ur, "/student/progress#practice");
  const ach = d.items.filter((i) => i.status === "approved" && ["achievement", "certificate", "milestone", "skill"].includes(i.kind)).slice(0, 4);
  const projects = d.items.filter((i) => i.kind === "project" || i.kind === "creative").slice(0, 3);
  const goals = d.goals.filter((g) => g.status === "active").slice(0, 3);
  const done = d.hw.filter((h) => h.handedIn).length;

  return (
    <div className="flex flex-col gap-5" dir={ur ? "rtl" : "ltr"} lang={ur ? "ur" : "en"}>
      <Celebrate items={milestones(d, ur)} ur={ur} />
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <div className="flex items-center justify-between gap-2"><h2 className="h2">{t("Today's timetable", "آج کا ٹائم ٹیبل")}</h2>
            {d.todayMark && <span className={`pill ${d.todayMark === "absent" ? "pill-red" : d.todayMark === "late" ? "pill-orange" : "pill-green"}`}>{d.todayMark === "present" ? t("Present", "حاضر") : d.todayMark === "late" ? t("Late", "دیر") : d.todayMark === "absent" ? t("Absent", "غیر حاضر") : t("Leave", "چھٹی")}</span>}</div>
          {!d.timetablePublished ? <p className="muted">{t("The school hasn't published the timetable yet.", "اسکول نے ابھی ٹائم ٹیبل جاری نہیں کیا۔")}</p>
            : d.periods.length === 0 ? <p className="muted">{t("No classes today. Enjoy your day!", "آج کوئی کلاس نہیں۔")}</p>
            : d.periods.map((c) => (
              <div key={c.sort} className="flex items-center gap-3 rounded-xl p-2 text-sm font-bold" style={{ background: "var(--page)" }}>
                <span className="w-12 tabular-nums" dir="ltr">{time(c.starts_at)}</span><span className="flex-1">{c.subject}</span><span className="muted text-xs">{c.teacher ?? ""}</span>
              </div>
            ))}
        </section>

        <section className="card">
          <div className="flex items-center justify-between gap-2"><h2 className="h2">{t("Homework checklist", "ہوم ورک کی فہرست")}</h2>
            {d.hw.length > 0 && <span className="pill pill-blue">{done}/{d.hw.length} {t("handed in", "جمع")}</span>}</div>
          {d.hw.length === 0 && <p className="muted">{t("No homework due. Nice and clear!", "کوئی ہوم ورک باقی نہیں۔")}</p>}
          {d.hw.map((h) => (
            <div key={h.id} className="row-box">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-md border-2 text-sm font-black" aria-hidden
                style={h.handedIn ? { background: "var(--green)", borderColor: "var(--green)", color: "#fff" } : { borderColor: "var(--line)" }}>{h.handedIn ? "✓" : ""}</span>
              <div className="flex-1"><div className="font-extrabold" style={h.handedIn ? { textDecoration: "line-through", opacity: 0.7 } : undefined}>{h.title}</div>
                <div className="muted text-xs">{h.subject} · {h.due_on === d.today ? t("due today", "آج جمع") : `${t("due", "جمع")} ${shortDate(h.due_on)}`}{h.checked ? ` · ${t("checked", "چیک ہو گیا")}${h.marks != null ? `: ${h.marks}` : ""}` : ""}{h.remark ? ` · "${h.remark}"` : ""}</div></div>
              {!h.checked && <HomeworkSubmit homeworkId={h.id} studentId={kid.id} done={h.handedIn} />}
            </div>
          ))}
        </section>
      </div>

      <section className="card" style={{ borderColor: "#c4b5fd" }}>
        <h2 className="h2">{t("What should I practise today?", "آج میں کیا مشق کروں؟")}</h2>
        <SuggestionList tips={tips} ur={ur} empty={t("Nothing extra today. Keep handing in homework on time.", "آج کچھ اضافی نہیں۔ ہوم ورک وقت پر جمع کرتے رہیں۔")} />
        <Link href="/student/progress#practice" className="btn self-start">{t("Start a practice test", "مشقی ٹیسٹ شروع کریں")}</Link>
      </section>

      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <h2 className="h2">{t("Upcoming tests", "آنے والے ٹیسٹ")}</h2>
          {d.upcoming.length === 0 ? <p className="muted">{t("No tests in the next few weeks.", "اگلے چند ہفتوں میں کوئی ٹیسٹ نہیں۔")}</p> : d.upcoming.slice(0, 6).map((u, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-xl p-2 text-sm font-bold" style={{ background: "var(--page)" }}>
              <span>{u.subject} · {u.title}</span><span className={`pill ${u.on_date === d.today ? "pill-orange" : "pill-blue"}`}>{u.on_date === d.today ? t("Today", "آج") : shortDate(u.on_date)}</span>
            </div>
          ))}
        </section>

        <section className="card">
          <h2 className="h2">{t("My progress", "میری ترقی")}</h2>
          {d.subjects.length === 0 ? <p className="muted">{t("Your progress shows here after your first published result.", "پہلا نتیجہ آنے کے بعد آپ کی ترقی یہاں نظر آئے گی۔")}</p> : (
            <>
              {d.subjects.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
                const b = band(s.latest, ur); const tr = trendSentence(s, ur);
                return (
                  <div key={s.id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-sm font-black"><span>{s.name}</span><span style={{ color: TONE[b.tone] }}>{b.word}</span></div>
                    <div className="track"><i style={{ width: `${Math.max(4, s.latest * 100)}%`, background: TONE[b.tone] }} /></div>
                    <div className="muted text-xs">{tr.dir === "up" ? "▲ " : tr.dir === "down" ? "▼ " : ""}{tr.text}</div>
                  </div>
                );
              })}
              <p className="muted text-xs">{t("Only your own results. Every child grows at their own pace.", "صرف آپ کے اپنے نتائج۔ ہر بچہ اپنی رفتار سے آگے بڑھتا ہے۔")}</p>
            </>
          )}
          <Link href="/student/progress" className="btn-ghost self-start">{t("More about my progress", "مزید تفصیل")}</Link>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-3 xl:items-start">
        <section className="card">
          <h2 className="h2">{t("My achievements", "میری کامیابیاں")}</h2>
          {ach.length === 0 ? <p className="muted">{t("Achievements your teachers approve appear here.", "اساتذہ کی منظور شدہ کامیابیاں یہاں نظر آئیں گی۔")}</p>
            : ach.map((i) => <div key={i.id} className="flex gap-2 text-sm font-bold"><span aria-hidden>{KIND_ICON[i.kind]}</span><span className="flex-1">{i.title}<span className="muted text-xs"> · {shortDate(i.happened_on)}</span></span></div>)}
        </section>
        {passport && <>
        <section className="card">
          <h2 className="h2">{t("My projects", "میرے پروجیکٹ")}</h2>
          {projects.length === 0 ? <p className="muted">{t("Add a project you are proud of to your passport.", "کوئی پروجیکٹ جس پر آپ کو فخر ہے پاسپورٹ میں شامل کریں۔")}</p>
            : projects.map((i) => <div key={i.id} className="flex flex-wrap items-center gap-2 text-sm font-bold"><span aria-hidden>{KIND_ICON[i.kind]}</span><span className="flex-1">{i.title}</span>{i.status === "pending" && <span className="pill pill-orange">{t("Waiting", "انتظار")}</span>}</div>)}
        </section>
        <section className="card">
          <h2 className="h2">{t("Learning goals", "سیکھنے کے اہداف")}</h2>
          {goals.length === 0 ? <p className="muted">{t("Set a small goal in your passport.", "پاسپورٹ میں ایک چھوٹا ہدف رکھیں۔")}</p>
            : goals.map((g) => <div key={g.id} className="text-sm font-bold">🎯 {g.goal}{g.target_on ? <span className="muted text-xs"> · {shortDate(g.target_on)}</span> : null}</div>)}
        </section>
        </>}
      </div>
      {passport && <Link href="/student/passport" className="btn self-start">{t("Open my Model Passport", "میرا ماڈل پاسپورٹ کھولیں")}</Link>}
    </div>
  );
}
