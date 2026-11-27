import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { mobilePK, whatsappLink } from "@/lib/messages";
import { buildBrief } from "@/lib/brief";
import { WaTabs } from "@/components/wa-tabs";
import { saveBrief } from "@/app/(app)/principal/care/actions";

// The principal's morning brief: today's numbers in one WhatsApp message at 7 am.
export default async function Brief({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole("principal", "owner");
  const sp = await searchParams;
  const sb = await createClient();
    const [{ data: s }, { data: camp }] = await Promise.all([
      sb.from("campus_settings").select("brief_phone, brief_enabled").eq("campus_id", me.campus_id).maybeSingle(),
      sb.from("campuses").select("schools(name)").eq("id", me.campus_id).maybeSingle(),
    ]);
    const text = await buildBrief(sb, me.campus_id, (camp?.schools as unknown as { name: string } | null)?.name ?? me.campus_name);
    const phone = mobilePK(s?.brief_phone);
  const body = (
      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <section className="card">
          <h2 className="h2">Today&apos;s brief</h2>
          <pre className="whitespace-pre-wrap rounded-xl p-3 text-sm font-bold" style={{ background: "var(--blue-soft)" }}>{text}</pre>
          {phone && <a className="btn self-start" target="_blank" rel="noreferrer" href={whatsappLink(phone, text)}>Open in WhatsApp</a>}
        </section>
        <form action={saveBrief} className="card">
          <h2 className="h2">Send every morning</h2>
          <p className="muted text-sm">At 7 am (Mon–Sat) this goes to your phone on the school&apos;s WhatsApp or SMS from Settings.</p>
          <label className="field">My mobile<input className="input" name="brief_phone" defaultValue={s?.brief_phone ?? ""} placeholder="0300 1234567" /></label>
          <label className="flex items-center gap-2.5 text-sm font-extrabold"><input type="checkbox" name="brief_enabled" defaultChecked={s?.brief_enabled ?? false} className="h-5 w-5" /> Send me the brief daily</label>
          <button className="btn self-start" type="submit">Save</button>
        </form>
      </div>
    );
    return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="kick">Messages</div><h1 className="h1">Morning brief</h1><p className="muted text-base">Today&apos;s numbers in one message on your phone.</p></div>
        <WaTabs current="brief" />
      </div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Saved.</div>}
      {body}
    </>
  );
}
