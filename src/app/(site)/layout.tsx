import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getLang, getSite } from "@/lib/site/load";
import { pick, filled } from "@/lib/site/content";
import { translator } from "@/lib/site/i18n";
import { SiteHeader } from "@/components/site/header";
import { CTA, telLink, waLink } from "@/components/site/parts";
import "./site.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-jakarta", display: "swap" });

// The public website around every page in this folder. On an address with no website
// (the app's own address), pages render without it and "/" goes to the dashboard as before.
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  if (!site) return <>{children}</>;
  const lang = await getLang();
  const t = translator(lang);
  const c = site.content;
  const items = [
    { href: "/", label: t("home") },
    { href: "/about", label: t("ourSchool") },
    { href: "/academics", label: t("learning") },
    { href: "/future-skills", label: t("futureSkills") },
    { href: "/student-life", label: t("studentLife") },
    { href: "/achievements", label: t("achievements") },
    { href: "/admissions", label: t("admissions") },
  ];
  const wa = waLink(c.contact.whatsapp, lang === "ur" ? "السلام علیکم، مجھے داخلے کے بارے میں معلومات چاہیے۔" : "Assalam o Alaikum, I would like to know about admissions.");
  const social = (["facebook", "instagram", "youtube", "tiktok"] as const).filter((k) => /^https:\/\//.test(c.social[k]));
  return (
    <div className={`ms ${jakarta.variable}`} dir={lang === "ur" ? "rtl" : "ltr"} lang={lang}>
      <a href="#main" className="skip">{t("skip")}</a>
      {site.mode === "preview" && (
        <div className="pv"><div className="wrap"><span>{t("preview")}</span><a href="/site-preview?off=1">{t("exitPreview")}</a></div></div>
      )}
      <SiteHeader
        name={site.name}
        logoUrl={site.logoUrl}
        items={items}
        lang={lang}
        labels={{ myModel: t("myModel"), apply: t("applyNow"), menu: t("menu"), close: t("close"), language: t("language") }}
      />
      <main id="main">{children}</main>
      <footer className="ftr">
        <div className="wrap">
          <div className="ftr-grid">
            <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
              <Link href="/" className="logo"><span className="logo-mark">M</span><span>MODEL SCHOOL</span></Link>
              <div>{site.name}</div>
              {filled(c.contact.address) && <div style={{ whiteSpace: "pre-line" }}>{pick(c.contact.address, lang)}</div>}
              {c.contact.phone && <a href={telLink(c.contact.phone)} className="ltr">{c.contact.phone}</a>}
              {c.contact.mapUrl && /^https:\/\//.test(c.contact.mapUrl) && <a href={c.contact.mapUrl} target="_blank" rel="noopener noreferrer">{t("openMap")}</a>}
            </div>
            <div>
              <h3>{t("admissions")}</h3>
              <ul>
                <li><Link href="/admissions">{t("admissions")}</Link></li>
                <li><Link href="/admissions/enquiry">{t("bookVisit")}</Link></li>
                {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer">{t("whatsapp")}</a></li>}
                <li><Link href="/contact">{t("contact")}</Link></li>
              </ul>
            </div>
            <div>
              <h3>{t("learning")}</h3>
              <ul>
                <li><Link href="/academics">{t("allAreas")}</Link></li>
                <li><Link href="/future-skills">{t("futureSkills")}</Link></li>
                <li><Link href="/student-life">{t("studentLife")}</Link></li>
                <li><Link href="/leadership">{t("leadership")}</Link></li>
              </ul>
            </div>
            <div>
              <h3>{t("portals")}</h3>
              <ul>
                <li><Link href="/portal">{t("myModel")}</Link></li>
                <li><Link href="/results">{lang === "ur" ? "رزلٹ دیکھیں" : "Check a result"}</Link></li>
                <li><Link href="/privacy">{t("privacy")}</Link></li>
                <li><Link href="/child-safety">{t("childSafety")}</Link></li>
              </ul>
              {social.length > 0 && (
                <>
                  <h3 style={{ marginTop: 20 }}>{t("followUs")}</h3>
                  <ul>{social.map((k) => <li key={k}><a href={c.social[k]} target="_blank" rel="noopener noreferrer" style={{ textTransform: "capitalize" }}>{k === "tiktok" ? "TikTok" : k === "youtube" ? "YouTube" : k}</a></li>)}</ul>
                </>
              )}
            </div>
          </div>
          <div className="ftr-line">
            <span>{t("footerLine")}</span>
            <span className="ftr-credit">{t("poweredBy")}</span>
          </div>
        </div>
      </footer>
      <div className="mbar">
        {wa ? <CTA href={wa} kind="wa">{t("whatsapp")}</CTA> : c.contact.phone ? <CTA href={telLink(c.contact.phone)} kind="ghost">{t("call")}</CTA> : null}
        <CTA href="/admissions/enquiry">{t("applyNow")}</CTA>
      </div>
    </div>
  );
}
