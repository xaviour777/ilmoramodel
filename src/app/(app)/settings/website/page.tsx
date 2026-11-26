import Link from "next/link";
import { PageHead } from "@/components/ilm";
import { requireRole } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { ACHIEVEMENT_CATEGORIES, PROJECT_CATEGORIES, missingFacts, withDefaults, type Showcase, type T } from "@/lib/site/content";
import { ImageField } from "./image-field";
import { publishSite, saveSite, withdrawSite } from "./actions";

type Search = { saved?: string; published?: string; withdrawn?: string; error?: string };

// English and Urdu side by side for one piece of text.
function Tx({ name, label, v, long, rows = 3, hint }: { name: string; label: string; v: T; long?: boolean; rows?: number; hint?: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="field">{label} · English
        {long ? <textarea className="input" name={`${name}.en`} defaultValue={v.en} rows={rows} /> : <input className="input" name={`${name}.en`} defaultValue={v.en} />}
      </label>
      <label className="field">{label} · اردو
        {long ? <textarea className="input" name={`${name}.ur`} defaultValue={v.ur} rows={rows} dir="rtl" lang="ur" style={{ fontFamily: "'Noto Nastaliq Urdu', serif", lineHeight: 2 }} />
          : <input className="input" name={`${name}.ur`} defaultValue={v.ur} dir="rtl" lang="ur" style={{ fontFamily: "'Noto Nastaliq Urdu', serif" }} />}
      </label>
      {hint && <p className="muted text-[12px] sm:col-span-2">{hint}</p>}
    </div>
  );
}

function Box({ title, sub, open, children }: { title: string; sub?: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="card" open={open}>
      <summary className="cursor-pointer list-none"><span className="h2">{title}</span>{sub && <span className="muted block text-[13px]">{sub}</span>}</summary>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </details>
  );
}

function ShowcaseRows({ name, items, cats, schoolId, kind }: { name: string; items: Showcase[]; cats: string[]; schoolId: string; kind: string }) {
  const rows = [...items, ...Array.from({ length: 2 }, () => ({ title: { en: "", ur: "" }, category: cats[0], text: { en: "", ur: "" }, image: "", verified: false, consent: false }))];
  return (
    <>
      {rows.map((x, i) => (
        <div key={i} className="rounded-[14px] border-2 border-[#e5e7eb] p-3 flex flex-col gap-3">
          <div className="kick">{i < items.length ? `${kind} ${i + 1}` : `New ${kind.toLowerCase()} (leave empty to skip)`}</div>
          <Tx name={`${name}.${i}.title`} label="Title" v={x.title} />
          <label className="field">Category
            <select className="input" name={`${name}.${i}.category`} defaultValue={x.category}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <Tx name={`${name}.${i}.text`} label="Description" v={x.text} long rows={2} />
          <ImageField name={`${name}.${i}.image`} label="Photo" value={x.image} schoolId={schoolId} />
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" name={`${name}.${i}.verified`} value="1" defaultChecked={x.verified} /> A teacher has checked this is true</label>
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" name={`${name}.${i}.consent`} value="1" defaultChecked={x.consent} /> No child is named or shown, or their guardian has given written permission</label>
          <p className="muted text-[12px]">It shows on the website only when both boxes are ticked. Untick the second box as soon as a guardian withdraws permission, then publish.</p>
        </div>
      ))}
    </>
  );
}

export default async function WebsiteSettings({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireRole("principal", "owner");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: row } = await supabase.from("school_sites").select("domains, status, draft, published, published_at, updated_at").maybeSingle();
  const c = withDefaults(row?.draft);
  const sid = me.school_id ?? "";
  const missing = missingFacts(c);
  const live = row?.status === "live";
  const changed = !!row && JSON.stringify(row.draft) !== JSON.stringify(row.published);
  const domains = (row?.domains as string[] | undefined) ?? [];
  const leaders = [...c.leadership, { name: "", role: { en: "", ur: "" }, bio: { en: "", ur: "" }, photo: "" }];
  const pk = (d: string) => new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

  return (
    <>
      <PageHead kick="Settings" title="Website" sub="Your school's public website in English and Urdu. Change the text and photos here, check the preview, then publish." />
      <div className="flex flex-wrap gap-2"><Link href="/settings" className="btn-ghost">← Settings</Link></div>
      {sp.error && <div className="notice-bad">{sp.error}</div>}
      {sp.saved && <div className="notice-ok">Draft saved. Visitors still see the last published version.</div>}
      {sp.published && <div className="notice-ok">Published. The website now shows this version.</div>}
      {sp.withdrawn && <div className="notice-ok">The website is off line. Visitors to its address now see the sign-in page only.</div>}

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="h2">{live ? "Website is live" : row ? "Website is off line" : "Website not set up yet"}</h2>
            <p className="muted text-[13px]">
              {row?.published_at ? `Last published ${pk(row.published_at)}.` : "Not published yet."}
              {changed && row?.published_at ? " The draft has changes that are not published." : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {row && <Link href="/site-preview" className="btn-ghost">Preview draft</Link>}
            {row && <form action={publishSite}><button className="btn" type="submit">Publish draft</button></form>}
            {live && <form action={withdrawSite}><button className="btn-ghost" type="submit">Take off line</button></form>}
          </div>
        </div>
        {missing.length > 0 && (
          <div className="mt-4 rounded-[14px] bg-[#fff7e6] p-3 text-[13px]">
            <div className="font-black">Still to add ({missing.length})</div>
            <p className="muted">Empty parts are hidden on the website, so nothing made-up is shown. Add these when you have them:</p>
            <ul className="mt-1 list-disc ps-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
      </section>

      <form action={saveSite} className="flex flex-col gap-4">
        <Box title="Web address" sub="Where the website opens. The school app opens at the same address under /portal." open={!row}>
          <label className="field">Web addresses (comma between them)
            <input className="input" name="$domains" defaultValue={domains.join(", ")} placeholder="modelschool.edu.pk, www.modelschool.edu.pk" />
          </label>
          <p className="muted text-[12px]">Each address must also be added to the website hosting (Vercel) and pointed there in the domain&apos;s DNS. Until then use Preview.</p>
        </Box>

        <Box title="Home: top banner" sub="The first thing a parent sees on the phone.">
          <Tx name="hero.eyebrow" label="Small line above" v={c.hero.eyebrow} />
          <Tx name="hero.title" label="Headline" v={c.hero.title} />
          <Tx name="hero.text" label="Supporting line" v={c.hero.text} long rows={2} />
          <ImageField name="hero.image" label="Banner photo (wide, real school photo)" value={c.hero.image} schoolId={sid} hint="Use a real photo of your school. Never stock or AI pictures of children." />
          <label className="field">Short school film (optional link to an .mp4 file, https)
            <input className="input" name="hero.video" defaultValue={c.hero.video} placeholder="https://…/school.mp4" />
          </label>
        </Box>

        <Box title="Home: a school that believes in every child">
          <Tx name="intro.title" label="Heading" v={c.intro.title} />
          <Tx name="intro.text" label="Text" v={c.intro.text} long />
          <ImageField name="intro.image" label="Photo" value={c.intro.image} schoolId={sid} />
          {c.intro.pillars.map((p, i) => (
            <div key={i} className="rounded-[14px] border-2 border-[#e5e7eb] p-3 flex flex-col gap-3">
              <Tx name={`intro.pillars.${i}.title`} label={`Point ${i + 1}`} v={p.title} />
              <Tx name={`intro.pillars.${i}.text`} label="Line" v={p.text} />
            </div>
          ))}
        </Box>

        <Box title="Principal's message" sub="Shown on the home page and the Leadership page.">
          <label className="field">Principal&apos;s name<input className="input" name="principal.name" defaultValue={c.principal.name} /></label>
          <Tx name="principal.title" label="Heading" v={c.principal.title} />
          <Tx name="principal.message" label="Message" v={c.principal.message} long rows={6} hint="The first paragraph shows on the home page. Leave an empty line between paragraphs." />
          <ImageField name="principal.photo" label="Principal's photo" value={c.principal.photo} schoolId={sid} />
          <label className="field">Welcome video (optional .mp4 link, https)<input className="input" name="principal.video" defaultValue={c.principal.video} /></label>
        </Box>

        <Box title="Our School page">
          <Tx name="about.story" label="Our story" v={c.about.story} long rows={5} hint="When and why the school started, in your own words." />
          <Tx name="about.mission" label="Mission" v={c.about.mission} long rows={2} />
          <Tx name="about.vision" label="Vision" v={c.about.vision} long rows={2} />
          <ImageField name="about.image" label="Photo" value={c.about.image} schoolId={sid} />
        </Box>

        <Box title="Leadership" sub="Owner, principal, coordinators. Leave the name empty to remove someone.">
          {leaders.map((p, i) => (
            <div key={i} className="rounded-[14px] border-2 border-[#e5e7eb] p-3 flex flex-col gap-3">
              <label className="field">Name<input className="input" name={`leadership.${i}.name`} defaultValue={p.name} /></label>
              <Tx name={`leadership.${i}.role`} label="Role" v={p.role} />
              <Tx name={`leadership.${i}.bio`} label="Short line" v={p.bio} long rows={2} />
              <ImageField name={`leadership.${i}.photo`} label="Photo" value={p.photo} schoolId={sid} />
            </div>
          ))}
        </Box>

        <Box title="Learning: the six areas" sub="Cards on the home page and the Learning page.">
          {c.areas.map((a, i) => (
            <div key={a.key} className="rounded-[14px] border-2 border-[#e5e7eb] p-3 flex flex-col gap-3">
              <input type="hidden" name={`areas.${i}.key`} value={a.key} />
              <Tx name={`areas.${i}.title`} label="Name" v={a.title} />
              <Tx name={`areas.${i}.short`} label="One line (card)" v={a.short} />
              <Tx name={`areas.${i}.body`} label="More detail (Learning page)" v={a.body} long rows={3} />
              <ImageField name={`areas.${i}.image`} label="Photo" value={a.image} schoolId={sid} />
            </div>
          ))}
        </Box>

        <Box title="Model AI Lab" sub="Describe only what really happens in the lab.">
          <Tx name="aiLab.title" label="Heading" v={c.aiLab.title} />
          <Tx name="aiLab.text" label="Text" v={c.aiLab.text} long />
          {[...c.aiLab.points, { en: "", ur: "" }].map((p, i) => <Tx key={i} name={`aiLab.points.${i}`} label={`Point ${i + 1}`} v={p} />)}
          <ImageField name="aiLab.image" label="Photo" value={c.aiLab.image} schoolId={sid} />
        </Box>

        <Box title="A day at Model" sub="Home page and Student Life page.">
          <Tx name="day.title" label="Heading" v={c.day.title} />
          <Tx name="day.text" label="Line" v={c.day.text} />
          <ImageField name="day.image" label="Photo" value={c.day.image} schoolId={sid} />
          {[...c.day.items, { time: "", title: { en: "", ur: "" }, text: { en: "", ur: "" } }].map((d, i) => (
            <div key={i} className="rounded-[14px] border-2 border-[#e5e7eb] p-3 flex flex-col gap-3">
              <label className="field">Time (optional, e.g. 8:00)<input className="input" name={`day.items.${i}.time`} defaultValue={d.time} /></label>
              <Tx name={`day.items.${i}.title`} label="What" v={d.title} />
              <Tx name={`day.items.${i}.text`} label="Line" v={d.text} />
            </div>
          ))}
        </Box>

        <Box title="Student projects (Made at Model)">
          <ShowcaseRows name="projects" items={c.projects} cats={PROJECT_CATEGORIES} schoolId={sid} kind="Project" />
        </Box>

        <Box title="Achievements (Model Achievers)" sub="Only real, checked achievements.">
          <ShowcaseRows name="achievements" items={c.achievements} cats={ACHIEVEMENT_CATEGORIES} schoolId={sid} kind="Achievement" />
        </Box>

        <Box title="Admissions">
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="admissions.open" value="1" defaultChecked={c.admissions.open} /> Admissions are open</label>
          <Tx name="admissions.title" label="Heading" v={c.admissions.title} />
          <Tx name="admissions.text" label="Text" v={c.admissions.text} long rows={2} />
          <Tx name="admissions.requirements" label="What parents need to bring" v={c.admissions.requirements} long rows={4} hint="For example: B-form, last result card, 2 photos. One item per line." />
          <Tx name="admissions.note" label="Extra note (optional)" v={c.admissions.note} long rows={2} />
          <p className="muted text-[12px]">Enquiries from the website appear in Admissions as &quot;inquiry&quot;, marked &quot;From the website&quot; with a reference number.</p>
        </Box>

        <Box title="Contact and social media">
          <Tx name="contact.address" label="Address" v={c.contact.address} long rows={2} />
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="field">Phone<input className="input" name="contact.phone" defaultValue={c.contact.phone} inputMode="tel" /></label>
            <label className="field">Official WhatsApp<input className="input" name="contact.whatsapp" defaultValue={c.contact.whatsapp} inputMode="tel" placeholder="0300 1234567" /></label>
            <label className="field">Email<input className="input" name="contact.email" defaultValue={c.contact.email} type="email" /></label>
          </div>
          <label className="field">Google Maps link<input className="input" name="contact.mapUrl" defaultValue={c.contact.mapUrl} placeholder="https://maps.app.goo.gl/…" /></label>
          <Tx name="contact.hours" label="Office hours" v={c.contact.hours} />
          <div className="grid gap-2 sm:grid-cols-2">
            {(["facebook", "instagram", "youtube", "tiktok"] as const).map((k) => <label key={k} className="field" style={{ textTransform: "capitalize" }}>{k}<input className="input" name={`social.${k}`} defaultValue={c.social[k]} placeholder="https://…" /></label>)}
          </div>
        </Box>

        <Box title="Privacy and child safety" sub="Starting text is provided. Read it, change what does not fit your school, and approve it.">
          <Tx name="policies.privacy" label="Privacy policy" v={c.policies.privacy} long rows={6} />
          <Tx name="policies.childSafety" label="Child safety" v={c.policies.childSafety} long rows={6} />
        </Box>

        <Box title="Google search text">
          <Tx name="seo.description" label="Short description" v={c.seo.description} long rows={2} />
        </Box>

        <div className="card sticky bottom-3 z-10 flex flex-wrap gap-2">
          <button className="btn" type="submit" name="$then" value="">Save draft</button>
          <button className="btn-ghost" type="submit" name="$then" value="preview">Save and preview</button>
          <button className="btn-ghost" type="submit" name="$then" value="publish">Save and publish</button>
        </div>
      </form>
    </>
  );
}
