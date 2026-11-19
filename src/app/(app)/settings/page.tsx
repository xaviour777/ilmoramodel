import Link from "next/link";
import { PageHead, Empty, Row } from "@/components/ilm";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { SETTINGS_COLS, readyChannels, type MessagingConfig } from "@/lib/deliver";
import { saveAbsentAlerts, saveMessaging, sendTest } from "./actions";

type Search = { s?: string; saved?: string; tested?: string; error?: string };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const sec = ["school", "roles", "msg", "pay", "rules"].includes(sp.s ?? "") ? sp.s! : "msg";
  const [{ data: s }, { data: k }, { data: alerts }, { data: campus }, { data: year }, { data: people }, { data: wallets }, { data: scales }, { data: boards }] = await Promise.all([
    supabase.from("campus_settings").select(SETTINGS_COLS).maybeSingle(),
    supabase.from("campus_secrets").select("whatsapp_token, sms_api_key").maybeSingle(),
    supabase.from("campus_settings").select("absent_alerts").maybeSingle(),
    supabase.from("campuses").select("name, city, schools(name, city)").eq("id", me.campus_id).maybeSingle(),
    supabase.from("academic_sessions").select("name, starts_on, ends_on").eq("is_current", true).maybeSingle(),
    supabase.from("profiles").select("id, full_name, role, user_id").eq("is_active", true).in("role", ["owner", "principal", "accountant", "teacher"]).order("full_name"),
    supabase.from("school_wallets").select("jazzcash_number, jazzcash_title, easypaisa_number, easypaisa_title").maybeSingle(),
    supabase.from("grading_scales").select("id, name, bands"),
    supabase.from("classes").select("board"),
  ]);
  const c = s as Partial<MessagingConfig> | null;
  // only ever show the last 4 characters of a saved token or key
  const tail = (v: string | null | undefined) => (v ? `saved, ends in ${v.slice(-4)}` : "not saved");
  const ready = readyChannels(c ? { ...(c as MessagingConfig), whatsapp_token: k?.whatsapp_token ?? null, sms_api_key: k?.sms_api_key ?? null } : null);

  const school = (campus?.schools as unknown as { name: string; city: string | null } | null);
  const boardList = [...new Set((boards ?? []).map((b) => b.board).filter(Boolean))];
  const ROLE: Record<string, [string, string, string]> = {
    owner: ["Owner", "g", "Everything, and approves money"], principal: ["Principal", "v", "Everything"],
    accountant: ["Accounts", "y", "Fees, expenses, salaries, reports"], teacher: ["Teacher", "b", "Own classes: attendance, marks, diary"],
  };
  const MENU: [string, string, string][] = [["school", "School and campus", "/settings?s=school"], ["roles", "People and permissions", "/settings?s=roles"], ["msg", "Messages and automation", "/settings"], ["pay", "Payments", "/settings?s=pay"], ["rules", "Attendance and grading", "/settings?s=rules"]];
  const MORE: [string, string][] = [["Website", "/settings/website"], ["AI", "/settings/ai"], ["School year and promotion", "/settings/year"], ["Messages sent", "/accounts/messages"], ["My profile", "/profile"]];
  const teachers = (people ?? []).filter((p) => p.role === "teacher");
  return (
    <>
      <PageHead kick="Money" title="Settings" sub="Set it once. Changes reach teachers and parents straight away." />
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {sp.tested && <div className="notice-ok">Test message sent. Check the phone.</div>}
      <section className="flex flex-wrap items-start gap-5">
        <nav aria-label="Settings sections" className="card flex min-w-0 flex-[1_1_240px] flex-col gap-1 lg:max-w-[280px]">
          {MENU.map(([id, l, h]) => (
            <Link key={id} href={h} aria-current={id === sec ? "page" : undefined} className="ilm-it">{l}</Link>
          ))}
          <div className="kick mt-3 mb-1 px-2.5">More</div>
          {MORE.map(([l, h]) => <Link key={h} href={h} className="ilm-it">{l}</Link>)}
        </nav>
        <div className="flex min-w-0 flex-[4_1_520px] flex-col gap-5">
          {sec === "school" && (
            <div className="card">
              <h2 className="h2">School and campus</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[["School name", school?.name ?? "—"], ["Campus", campus?.name ?? me.campus_name], ["City", campus?.city || school?.city || "—"],
                  ["Session", year ? `${year.name} (${year.starts_on.slice(0, 7)} to ${year.ends_on.slice(0, 7)})` : "Not set"], ["Board", boardList.join(", ") || "Not set on any class"]].map(([l, v]) => (
                  <div key={l} className="rounded-[14px] border-2 border-[#e5e7eb] p-3"><div className="kick">{l}</div><div className="mt-0.5 font-black">{v}</div></div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2.5"><Link href="/settings/year" className="btn">School year and promotion</Link><Link href="/principal/classes" className="btn-ghost">Boards on classes</Link></div>
              <p className="muted mt-2 text-[13px]">The school and campus names are set when the school is created. Ask Ilmora support to change them.</p>
            </div>
          )}
          {sec === "roles" && (
            <div className="card">
              <div className="flex items-center justify-between gap-2"><h2 className="h2">People and permissions</h2><Link href="/principal/staff#add" className="btn" style={{ minHeight: 36, fontSize: 12 }}>Add person</Link></div>
              {(people ?? []).filter((p) => p.role !== "teacher").map((p) => (
                <Row key={p.id}>
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#ede9fe] text-[13px] font-black text-[#6d28d9]">{p.full_name.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join("")}</span>
                  <div className="min-w-0 flex-1"><Link href={`/principal/staff/${p.id}`} className="font-black">{p.full_name}</Link><div className="muted text-[12px]">{ROLE[p.role][0]} · {ROLE[p.role][2]}{p.user_id ? "" : " · no login yet"}</div></div>
                  <span className={`tagx ${ROLE[p.role][1]}`}>{ROLE[p.role][0]}</span>
                </Row>
              ))}
              <Row>
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#e0f2fe] text-[13px] font-black text-[#0369a1]">{teachers.length}</span>
                <div className="min-w-0 flex-1"><Link href="/principal/staff" className="font-black">Teachers</Link><div className="muted text-[12px]">{ROLE.teacher[2]} · {teachers.filter((t) => t.user_id).length} can log in</div></div>
                <span className="tagx b">Teacher</span>
              </Row>
            </div>
          )}
          {sec === "pay" && (
            <div className="card">
              <h2 className="h2">Payments</h2>
              <Row><span className="ilm-tile t-o font-black">J</span><div className="min-w-0 flex-1"><div className="font-black">JazzCash</div><div className="muted text-[12px]">{wallets?.jazzcash_number ? `${wallets.jazzcash_number}${wallets.jazzcash_title ? ` · ${wallets.jazzcash_title}` : ""}` : "No number saved"}</div></div>
                <span className={`tagx ${wallets?.jazzcash_number ? "g" : ""}`}>{wallets?.jazzcash_number ? "Connected" : "Not set"}</span></Row>
              <Row><span className="ilm-tile t-g font-black">E</span><div className="min-w-0 flex-1"><div className="font-black">Easypaisa</div><div className="muted text-[12px]">{wallets?.easypaisa_number ? `${wallets.easypaisa_number}${wallets.easypaisa_title ? ` · ${wallets.easypaisa_title}` : ""}` : "No number saved"}</div></div>
                <span className={`tagx ${wallets?.easypaisa_number ? "g" : ""}`}>{wallets?.easypaisa_number ? "Connected" : "Not set"}</span></Row>
              <Row><span className="ilm-tile t-n font-black">Rs</span><div className="min-w-0 flex-1"><div className="font-black">Cash at the fee desk</div><div className="muted text-[12px]">Receipts and day close</div></div><span className="tagx g">On</span></Row>
              <Link href="/accounts/online" className="btn mt-3 inline-flex">Change wallet numbers</Link>
            </div>
          )}
          {sec === "rules" && (
            <div className="card">
              <h2 className="h2">Attendance and grading</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[["Attendance goal", "90%"], ["Flag a student after", "3 absences in 3 weeks"], ["Late", "counts as present"]].map(([l, v]) => (
                  <div key={l} className="rounded-[14px] border-2 border-[#e5e7eb] p-3"><div className="kick">{l}</div><div className="mt-0.5 font-black">{v}</div></div>
                ))}
              </div>
              <div className="kick mt-4 mb-1">Grading scales</div>
              {(scales ?? []).map((g) => (
                <Row key={g.id}><span className="w-40 font-black">{g.name}</span>
                  <span className="flex flex-wrap gap-1.5">{((g.bands ?? []) as { grade: string; min: number }[]).map((b) => <span key={b.grade} className="tagx v">{b.grade} {b.min}%+</span>)}</span></Row>
              ))}
              {(scales ?? []).length === 0 && <Empty>No grading scale yet.</Empty>}
              <p className="muted mt-2 text-[13px]">Each exam picks its grading scale when you create it.</p>
            </div>
          )}
          {sec === "msg" && (
            <>
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
                <section className="card">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="h2">WhatsApp Business</h2>
                    <span className={`pill ${ready.includes("whatsapp") ? "pill-green" : "pill-gray"}`}>{ready.includes("whatsapp") ? "Connected" : "Not connected"}</span>
                  </div>
                  <details className="text-sm font-semibold">
                    <summary className="eyebrow cursor-pointer">How to get these (one time, about 30 minutes)</summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      <li>Open business.facebook.com and create a business account for the school.</li>
                      <li>In developers.facebook.com make an app, add <b>WhatsApp</b>, and add the school&apos;s phone number (a number not already on the WhatsApp app).</li>
                      <li>From <b>WhatsApp → API setup</b> copy the <b>Phone number ID</b>.</li>
                      <li>In <b>Business settings → System users</b> make a permanent <b>access token</b> with WhatsApp permissions.</li>
                      <li>In <b>WhatsApp Manager → Message templates</b> create a Utility template, for example <code>school_update</code>, with the body <code>{"{{1}}"}</code>. Once Meta approves it, write its name below.</li>
                    </ol>
                    <p className="mt-2">Meta charges per message after the free monthly quota. Without a template, WhatsApp only delivers to parents who messaged the school in the last 24 hours.</p>
                  </details>
                  <form action={saveMessaging} className="flex flex-col gap-3">
                    <input type="hidden" name="which" value="whatsapp" />
                    <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="enabled" defaultChecked={c?.whatsapp_enabled ?? false} className="h-5 w-5" /> Send WhatsApp messages automatically</label>
                    <label className="field">Phone number ID<input className="input" name="phone_number_id" inputMode="numeric" defaultValue={c?.whatsapp_phone_number_id ?? ""} placeholder="1234567890123456" /></label>
                    <label className="field">Access token ({tail(k?.whatsapp_token)})<input className="input" name="secret" type="password" autoComplete="off" placeholder="Paste to save or replace" /></label>
                    <div className="grid grid-cols-[1fr_8rem] gap-3">
                      <label className="field">Template name<input className="input" name="template" defaultValue={c?.whatsapp_template ?? ""} placeholder="school_update" /></label>
                      <label className="field">Language<input className="input" name="template_lang" defaultValue={c?.whatsapp_template_lang ?? "en"} /></label>
                    </div>
                    <button className="btn self-start" type="submit">Save WhatsApp</button>
                  </form>
                  <form action={sendTest} className="flex items-end gap-2">
                    <input type="hidden" name="which" value="whatsapp" />
                    <label className="field flex-1">Send a test to<input className="input" name="to" inputMode="tel" placeholder="03001234567" required /></label>
                    <button className="btn-ghost" type="submit">Test</button>
                  </form>
                </section>

                <section className="card">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="h2">SMS gateway</h2>
                    <span className={`pill ${ready.includes("sms") ? "pill-green" : "pill-gray"}`}>{ready.includes("sms") ? "Connected" : "Not connected"}</span>
                  </div>
                  <p className="muted">
                    Works with any SMS company that gives an HTTP link (branded SMS / masking providers in Pakistan do). Copy the link from their
                    API page and put these words where the values go: <code>{"{to}"}</code> (923001234567), <code>{"{to_local}"}</code> (03001234567),
                    <code> {"{message}"}</code>, <code>{"{sender}"}</code>, <code>{"{key}"}</code>.
                  </p>
                  <form action={saveMessaging} className="flex flex-col gap-3">
                    <input type="hidden" name="which" value="sms" />
                    <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="enabled" defaultChecked={c?.sms_enabled ?? false} className="h-5 w-5" /> Send SMS automatically</label>
                    <label className="field">Gateway link
                      <input className="input" name="sms_url" defaultValue={c?.sms_url ?? ""} placeholder="https://sms.example.pk/api/send?key={key}&to={to}&from={sender}&text={message}" />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="field">Method
                        <select className="input" name="method" defaultValue={c?.sms_method ?? "GET"}><option value="GET">GET (all in the link)</option><option value="POST">POST (with a body)</option></select>
                      </label>
                      <label className="field">Sender ID / mask<input className="input" name="sender" defaultValue={c?.sms_sender ?? ""} placeholder="MODELSCHOOL" /></label>
                    </div>
                    <label className="field">POST body (only for POST)
                      <textarea className="input min-h-20 py-3 font-mono text-xs" name="body" defaultValue={c?.sms_body ?? ""} placeholder={'{"to":"{to}","sender":"{sender}","message":"{message}","api_key":"{key}"}'} />
                    </label>
                    <label className="field">API key ({tail(k?.sms_api_key)})<input className="input" name="secret" type="password" autoComplete="off" placeholder="Paste to save or replace" /></label>
                    <button className="btn self-start" type="submit">Save SMS</button>
                  </form>
                  <form action={sendTest} className="flex items-end gap-2">
                    <input type="hidden" name="which" value="sms" />
                    <label className="field flex-1">Send a test to<input className="input" name="to" inputMode="tel" placeholder="03001234567" required /></label>
                    <button className="btn-ghost" type="submit">Test</button>
                  </form>
                </section>
              </div>
              <form action={saveAbsentAlerts} className="card">
                <h2 className="h2">Absent alerts</h2>
                <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="absent_alerts" defaultChecked={alerts?.absent_alerts ?? true} className="h-5 w-5" /> Message parents when their child is marked absent</label>
                <p className="muted">When a teacher saves attendance, each absent child&apos;s parents get one message for that day. With WhatsApp or SMS connected above, it goes out as soon as the office opens Today or the fee desk; otherwise it waits in Messages sent for one tap.</p>
                <button className="btn-ghost self-start" type="submit">Save</button>
              </form>
              <p className="muted">Tokens and keys are never shown again after saving. Only the principal and owner can change them; fee reminders sent by the accounts office use them too.</p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
