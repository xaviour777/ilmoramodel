import { SettingsTabs } from "@/components/settings-tabs";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { SETTINGS_COLS, readyChannels, type MessagingConfig } from "@/lib/deliver";
import { saveMessaging, sendTest } from "./actions";

type Search = { saved?: string; tested?: string; error?: string };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: s }, { data: k }] = await Promise.all([
    supabase.from("campus_settings").select(SETTINGS_COLS).maybeSingle(),
    supabase.from("campus_secrets").select("whatsapp_token, sms_api_key").maybeSingle(),
  ]);
  const c = s as Partial<MessagingConfig> | null;
  // only ever show the last 4 characters of a saved token or key
  const tail = (v: string | null | undefined) => (v ? `saved, ends in ${v.slice(-4)}` : "not saved");
  const ready = readyChannels(c ? { ...(c as MessagingConfig), whatsapp_token: k?.whatsapp_token ?? null, sms_api_key: k?.sms_api_key ?? null } : null);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Settings</h1>
          <p className="muted text-base">{me.campus_name}: connect WhatsApp and SMS so fee reminders and notices reach parents by themselves.</p>
        </div>
        <SettingsTabs current="connect" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {sp.tested && <div className="notice-ok">Test message sent. Check the phone.</div>}

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
      <p className="muted">Tokens and keys are never shown again after saving. Only the principal and owner can change them; fee reminders sent by the accounts office use them too.</p>
    </>
  );
}
