import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { shortDate } from "@/lib/format";
import { CHANNEL_LABEL, CHOICE_LABEL } from "@/lib/messages";
import { addInquiry, admitStudent, moveAdmission } from "../actions";

const COLS = [
  { id: "inquiry", label: "Inquiry", next: ["test", "Book test"] },
  { id: "test", label: "Entry test", next: ["offered", "Offer seat"] },
  { id: "offered", label: "Offered", next: null },
  { id: "admitted", label: "Admitted", next: null },
] as const;

export default async function AdmissionsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireRole("principal", "owner", "accountant");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: rows }, { data: classes }, { data: sections }] = await Promise.all([
    supabase.from("admissions").select("*, classes(name)").neq("status", "declined").order("created_at", { ascending: false }),
    supabase.from("classes").select("id, name").order("sort"),
    supabase.from("sections").select("id, name, class_id, classes(name, sort)"),
  ]);
  type Sec = { id: string; name: string; class_id: string; classes: { name: string } };
  const secs = (sections ?? []) as unknown as Sec[];

  return (
    <>
      <div>
        <h1 className="h1">Admissions</h1>
        <p className="muted text-base">From first call to first day. Admitting a child creates the family and student records.</p>
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((c) => {
          const list = (rows ?? []).filter((r) => r.status === c.id);
          return (
            <section key={c.id} className="card">
              <div className="flex items-baseline justify-between"><h2 className="h2">{c.label}</h2><span className="pill pill-gray">{list.length}</span></div>
              {list.map((a) => (
                <div key={a.id} className="flex flex-col gap-2 rounded-2xl border-2 p-3" style={{ borderColor: "var(--line)" }}>
                  <div className="font-black">{a.child_name}</div>
                  <div className="muted text-xs">{a.classes?.name ?? "Class not set"} · {a.guardian_name} · {a.phone}</div>
                  {(a.reminder_phone || a.reminder_channel !== "auto") && (
                    <div className="muted text-xs">Reminders: {a.reminder_phone ?? a.phone}{a.reminder_channel !== "auto" ? ` on ${CHANNEL_LABEL[a.reminder_channel as "whatsapp" | "sms"]}` : ""}</div>
                  )}
                  {a.test_on && <div className="muted text-xs">Test {shortDate(a.test_on)}</div>}
                  {a.notes && <div className="text-xs font-bold">{a.notes}</div>}
                  {c.next && (
                    <form action={moveAdmission} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="admission_id" value={a.id} />
                      <input type="hidden" name="status" value={c.next[0]} />
                      {c.id === "inquiry" && <input className="input min-h-10 flex-1 py-1 text-sm" type="date" name="test_on" aria-label="Test date" />}
                      <button className="btn-ghost min-h-10 px-3 text-xs" type="submit">{c.next[1]}</button>
                    </form>
                  )}
                  {c.id !== "admitted" && (
                    <details className="flex flex-col gap-2" open={c.id === "offered"}>
                      <summary className="eyebrow cursor-pointer">{c.id === "offered" ? "Admit" : "Admit now"}</summary>
                      <form action={admitStudent} className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="admission_id" value={a.id} />
                      <div className="flex gap-2">
                        <select className="input min-h-10 flex-1 py-1 text-sm" name="section_id" required aria-label="Section">
                          {secs.filter((s) => !a.applying_class_id || s.class_id === a.applying_class_id).map((s) => <option key={s.id} value={s.id}>{s.classes.name}-{s.name}</option>)}
                        </select>
                        <input className="input min-h-10 w-20 py-1 text-sm" name="roll_no" placeholder="Roll" aria-label="Roll number" />
                      </div>
                      <input className="input min-h-10 py-1 text-sm" name="admission_no" placeholder="Admission no" aria-label="Admission number" />
                      <label className="flex items-center gap-2 text-xs font-extrabold"><input type="checkbox" name="first_challan" defaultChecked className="h-4 w-4" /> Make the first challan (admission + this month)</label>
                      <button className="btn min-h-10 text-sm" type="submit">Admit</button>
                      </form>
                    </details>
                  )}
                  {c.id !== "admitted" && (
                    <form action={moveAdmission}><input type="hidden" name="admission_id" value={a.id} /><input type="hidden" name="status" value="declined" />
                      <button className="muted text-xs underline" type="submit">Mark as declined</button></form>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <form action={addInquiry} className="card max-w-3xl">
        <h2 className="h2">New inquiry</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="field">Child&apos;s name<input className="input" name="child_name" required /></label>
          <label className="field">Parent or guardian<input className="input" name="guardian_name" required /></label>
          <label className="field">Phone<input className="input" name="phone" required inputMode="tel" placeholder="03001234567" /></label>
          <label className="field">Class applying for<select className="input" name="class_id"><option value="">Not sure yet</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <span className="muted text-xs font-semibold">Class missing? Add it in <a href="/principal/classes" className="underline">Classes</a>.</span></label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="field">Number for fee reminders and notices<input className="input" name="reminder_phone" inputMode="tel" placeholder="Leave empty to use the phone above" /></label>
          <label className="field">Send them by
            <select className="input" name="reminder_channel" defaultValue="auto">
              {Object.entries(CHOICE_LABEL).map(([k, v]) => <option key={k} value={k}>{k === "auto" ? `${v} (WhatsApp first, SMS if no reply)` : v}</option>)}
            </select>
          </label>
        </div>
        <label className="field">Notes<input className="input" name="notes" placeholder="Walk-in, sibling already here" /></label>
        <details>
          <summary className="eyebrow cursor-pointer">More details (fills the student record and the board form)</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="field">Child&apos;s B-form no<input className="input" name="b_form" placeholder="35202-1234567-1" /></label>
            <label className="field">Father&apos;s CNIC<input className="input" name="father_cnic" placeholder="35202-1234567-1" /></label>
            <label className="field">Date of birth<input className="input" type="date" name="date_of_birth" /></label>
            <label className="field">Gender<select className="input" name="gender" defaultValue=""><option value="">Not set</option><option value="male">Boy</option><option value="female">Girl</option></select></label>
            <label className="field">Previous school<input className="input" name="previous_school" /></label>
            <label className="field">Last class passed<input className="input" name="last_class_passed" placeholder="Class 5" /></label>
          </div>
          <label className="field mt-3">Home address<input className="input" name="address" /></label>
        </details>
        <button className="btn self-start" type="submit">Add inquiry</button>
      </form>
    </>
  );
}
