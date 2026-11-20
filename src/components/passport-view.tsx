import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { shortDate, todayPK } from "@/lib/format";
import { KIND_ICON, KIND_LABEL, say, type Kid } from "@/lib/learning";
import { addGoal, addPassportItem, deletePassportItem, setGoalStatus, setItemPublic, setPassportShare } from "@/app/(app)/passport/actions";

export type PassportItem = {
  id: string; kind: string; title: string; body: string | null; happened_on: string; status: string; teacher_note: string | null;
  show_public: boolean; link_url: string | null; created_by: string | null; approved_at: string | null; subjects: { name: string } | null;
};
export type Goal = { id: string; goal: string; target_on: string | null; status: string; done_at: string | null; subjects: { name: string } | null };

export async function passportData(kidId: string) {
  const supabase = await createClient();
  const [{ data: items }, { data: goals }, { data: share }] = await Promise.all([
    supabase.from("passport_items").select("id, kind, title, body, happened_on, status, teacher_note, show_public, link_url, created_by, approved_at, subjects(name)")
      .eq("student_id", kidId).order("happened_on", { ascending: false }).limit(200),
    supabase.from("learning_goals").select("id, goal, target_on, status, done_at, subjects(name)").eq("student_id", kidId).neq("status", "dropped").order("created_at", { ascending: false }).limit(50),
    supabase.from("passport_shares").select("code, is_on, consent_at").eq("student_id", kidId).maybeSingle(),
  ]);
  return { items: (items ?? []) as unknown as PassportItem[], goals: (goals ?? []) as unknown as Goal[], share: share as { code: string; is_on: boolean; consent_at: string | null } | null };
}

const ORDER = ["achievement", "certificate", "milestone", "project", "skill", "creative", "reflection"];

// The student's Model Passport: goals, work and verified achievements. Private by default.
export async function PassportView({ kid, role, meId, ur, back }: { kid: Kid; role: string; meId: string; ur: boolean; back: string }) {
  const t = say(ur);
  const supabase = await createClient();
  const { items, goals, share } = await passportData(kid.id);
  const { data: subs } = kid.section_id ? await supabase.from("section_subjects").select("subject_id, subjects(name)").eq("section_id", kid.section_id) : { data: [] };
  const subjects = ((subs ?? []) as unknown as { subject_id: string; subjects: { name: string } | null }[]).filter((s) => s.subjects);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const approved = items.filter((i) => i.status === "approved");
  const parent = role === "parent";
  const first = kid.full_name.split(" ")[0];
  const cls = kid.sections ? `${kid.sections.classes.name}-${kid.sections.name}` : "";
  const kinds = parent || role === "student" ? ["project", "milestone", "skill", "creative", "reflection"] : ORDER;
  const Hidden = () => <><input type="hidden" name="student_id" value={kid.id} /><input type="hidden" name="back" value={back} /></>;

  return (
    <div className="flex flex-col gap-5" dir={ur ? "rtl" : "ltr"} lang={ur ? "ur" : "en"}>
      <section className="overflow-hidden rounded-3xl p-5 text-white" style={{ background: "linear-gradient(135deg, #0f2a44 0%, #12806b 100%)" }}>
        <div className="text-xs font-black uppercase tracking-widest opacity-80">{t("Model Passport", "ماڈل پاسپورٹ")}</div>
        <div className="mt-1 text-3xl font-black">{kid.full_name}</div>
        <div className="font-bold opacity-90">{cls}</div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-black">
          {ORDER.map((k) => { const n = approved.filter((i) => i.kind === k).length; return n ? <span key={k} className="rounded-full bg-white/15 px-3 py-1">{KIND_ICON[k]} {n} {t(KIND_LABEL[k][0], KIND_LABEL[k][1])}</span> : null; })}
          {approved.length === 0 && <span className="rounded-full bg-white/15 px-3 py-1">{t("Your journey starts here", "آپ کا سفر یہاں سے شروع ہوتا ہے")}</span>}
        </div>
        <div className="mt-3 text-sm font-bold opacity-90">
          🔒 {share?.is_on ? t("Shared by a parent with a private link. Only ticked items show on it.", "والدین نے ایک خاص لنک سے شیئر کیا ہے۔ اس پر صرف منتخب چیزیں نظر آتی ہیں۔")
            : t(`Private: only ${first}, the family and the teachers can see this.`, `نجی: یہ صرف ${first}، گھر والے اور اساتذہ دیکھ سکتے ہیں۔`)}
        </div>
        <Link href={`/print/passport/${kid.id}`} target="_blank" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-white px-4 font-black" style={{ color: "#0f2a44" }}>{t("Print achievement summary", "کامیابیوں کا خلاصہ پرنٹ کریں")}</Link>
      </section>

      <section className="card">
        <h2 className="h2">{t("Learning goals", "سیکھنے کے اہداف")}</h2>
        {goals.filter((g) => g.status === "active").length === 0 && <p className="muted">{t("No goals yet. Set one small goal you can reach in a few weeks.", "ابھی کوئی ہدف نہیں۔ ایک چھوٹا ہدف رکھیں جو چند ہفتوں میں پورا ہو سکے۔")}</p>}
        {goals.filter((g) => g.status === "active").map((g) => (
          <div key={g.id} className="row-box">
            <span aria-hidden>🎯</span>
            <div className="flex-1"><div className="font-extrabold">{g.goal}</div><div className="muted text-xs">{g.subjects?.name ?? ""}{g.target_on ? ` · ${t("by", "تک")} ${shortDate(g.target_on)}` : ""}</div></div>
            <form action={setGoalStatus}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="status" value="done" /><input type="hidden" name="back" value={back} />
              <button className="btn min-h-9 px-3 text-xs">{t("Reached it", "پورا ہو گیا")}</button></form>
            <form action={setGoalStatus}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="status" value="dropped" /><input type="hidden" name="back" value={back} />
              <button className="muted text-xs underline">{t("Remove", "ہٹائیں")}</button></form>
          </div>
        ))}
        {goals.filter((g) => g.status === "done").length > 0 && (
          <div className="flex flex-wrap gap-2">{goals.filter((g) => g.status === "done").slice(0, 8).map((g) => <span key={g.id} className="pill pill-green">✓ {g.goal}</span>)}</div>
        )}
        <details>
          <summary className="cursor-pointer font-extrabold">{t("+ Add a goal", "+ نیا ہدف")}</summary>
          <form action={addGoal} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <Hidden />
            <input name="goal" required maxLength={200} className="input" placeholder={t("e.g. Read one English story every week", "مثلاً ہر ہفتے ایک انگریزی کہانی پڑھنا")} />
            <select name="subject_id" className="input"><option value="">{t("Any subject", "کوئی بھی مضمون")}</option>{subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.subjects!.name}</option>)}</select>
            <input type="date" name="target_on" min={todayPK()} className="input" aria-label={t("Target date", "تاریخ")} />
            <button className="btn">{t("Save", "محفوظ کریں")}</button>
          </form>
        </details>
      </section>

      {ORDER.map((k) => {
        const list = items.filter((i) => i.kind === k);
        if (!list.length) return null;
        return (
          <section key={k} className="card">
            <h2 className="h2">{KIND_ICON[k]} {t(KIND_LABEL[k][0], KIND_LABEL[k][1])}</h2>
            {list.map((i) => (
              <div key={i.id} className="row-box items-start">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{i.title}</b>
                    {i.status === "approved" && <span className="pill pill-green">{k === "achievement" || k === "certificate" ? t("Verified by school", "اسکول سے تصدیق شدہ") : t("Teacher approved", "استاد نے منظور کیا")}</span>}
                    {i.status === "pending" && <span className="pill pill-orange">{t("Waiting for teacher", "استاد کی منظوری کا انتظار")}</span>}
                    {i.status === "rejected" && <span className="pill pill-gray">{t("Sent back", "واپس بھیجا گیا")}</span>}
                    {i.show_public && <span className="pill pill-blue">{t("On public link", "عوامی لنک پر")}</span>}
                  </div>
                  <div className="muted text-xs">{shortDate(i.happened_on)}{i.subjects ? ` · ${i.subjects.name}` : ""}</div>
                  {i.body && <p className="mt-1 text-sm font-semibold">{i.body}</p>}
                  {i.link_url && <a href={i.link_url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold underline">{t("Open the work", "کام دیکھیں")}</a>}
                  {i.teacher_note && <p className="mt-1 text-sm font-bold" style={{ color: "var(--blue-ink)" }}>{t("Teacher", "استاد")}: {i.teacher_note}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {parent && share?.is_on && i.status === "approved" && (
                    <form action={setItemPublic}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="on" value={i.show_public ? "0" : "1"} /><input type="hidden" name="back" value={back} />
                      <button className="btn-ghost min-h-9 px-3 text-xs">{i.show_public ? t("Hide from link", "لنک سے ہٹائیں") : t("Show on link", "لنک پر دکھائیں")}</button></form>
                  )}
                  {i.created_by === meId && i.status !== "approved" && (
                    <form action={deletePassportItem}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="back" value={back} />
                      <button className="muted text-xs underline">{t("Delete", "مٹائیں")}</button></form>
                  )}
                </div>
              </div>
            ))}
          </section>
        );
      })}

      <section className="card">
        <h2 className="h2">{t("Add to the passport", "پاسپورٹ میں شامل کریں")}</h2>
        <p className="muted text-sm">{role === "student" || parent
          ? t("Add a project, something new you learnt, a skill, creative work or your own thoughts. A teacher checks it before it counts as verified. School achievements and certificates are added by teachers.", "کوئی پروجیکٹ، نئی سیکھی بات، مہارت، تخلیقی کام یا اپنی سوچ لکھیں۔ استاد چیک کر کے منظور کریں گے۔ اسکول کی کامیابیاں اور سرٹیفکیٹ اساتذہ شامل کرتے ہیں۔")
          : t("What you add here is approved at once.", "آپ کا شامل کیا ہوا فوراً منظور ہو جاتا ہے۔")}</p>
        <form action={addPassportItem} className="grid gap-2 sm:grid-cols-2">
          <Hidden />
          <select name="kind" className="input" required>{kinds.map((k) => <option key={k} value={k}>{KIND_ICON[k]} {t(KIND_LABEL[k][0], KIND_LABEL[k][1])}</option>)}</select>
          <input name="title" required maxLength={160} className="input" placeholder={t("Title, e.g. Made a solar oven", "عنوان، مثلاً سولر اوون بنایا")} />
          <select name="subject_id" className="input"><option value="">{t("No subject", "کوئی مضمون نہیں")}</option>{subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.subjects!.name}</option>)}</select>
          <input type="date" name="happened_on" max={todayPK()} defaultValue={todayPK()} className="input" aria-label={t("Date", "تاریخ")} />
          <textarea name="body" maxLength={2000} rows={3} className="input sm:col-span-2" placeholder={t("What did you do and what did you learn?", "آپ نے کیا کیا اور کیا سیکھا؟")} />
          <input name="link_url" type="url" pattern="https://.*" className="input sm:col-span-2" placeholder={t("Link to photo or video (optional, https://)", "تصویر یا ویڈیو کا لنک (اختیاری)")} />
          <button className="btn sm:col-span-2">{t("Add", "شامل کریں")}</button>
        </form>
      </section>

      <section className="card">
        <h2 className="h2">{t("Sharing", "شیئر کرنا")}</h2>
        {parent ? (
          share?.is_on ? (
            <>
              <p className="font-bold">{t("Public link is ON. Only the items you tick \"Show on link\" appear, with first name and class only.", "عوامی لنک چالو ہے۔ اس پر صرف وہ چیزیں نظر آتی ہیں جن پر آپ نے \"لنک پر دکھائیں\" دبایا، صرف پہلا نام اور کلاس کے ساتھ۔")}</p>
              <code className="block break-all rounded-xl p-2 text-sm" dir="ltr" style={{ background: "var(--page)" }}>https://{host}/passport/{share.code}</code>
              <div className="flex flex-wrap gap-2">
                <form action={setPassportShare}><Hidden /><input type="hidden" name="on" value="1" /><input type="hidden" name="new_code" value="1" /><button className="btn-ghost">{t("Make a new link (old one stops)", "نیا لنک بنائیں (پرانا بند)")}</button></form>
                <form action={setPassportShare}><Hidden /><input type="hidden" name="on" value="0" /><button className="btn-ghost">{t("Turn sharing off", "شیئر بند کریں")}</button></form>
              </div>
            </>
          ) : (
            <>
              <p className="font-bold">{t("Nothing is public. You can make a private link to show chosen achievements to relatives or another school. You can turn it off any time.", "کچھ بھی عوامی نہیں۔ آپ رشتہ داروں یا کسی اور اسکول کو چنی ہوئی کامیابیاں دکھانے کے لیے خاص لنک بنا سکتے ہیں۔ جب چاہیں بند کر دیں۔")}</p>
              <form action={setPassportShare}><Hidden /><input type="hidden" name="on" value="1" /><button className="btn">{t("I agree: make a share link", "میں اجازت دیتا ہوں: لنک بنائیں")}</button></form>
            </>
          )
        ) : <p className="muted">{t("Only a parent or guardian can share the passport outside school.", "پاسپورٹ اسکول سے باہر صرف والدین یا سرپرست شیئر کر سکتے ہیں۔")}</p>}
      </section>
    </div>
  );
}
