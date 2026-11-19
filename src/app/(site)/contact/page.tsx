import { pageMeta, requireSite } from "@/lib/site/load";
import { pick, filled } from "@/lib/site/content";
import { CTA, PageHead, ToAdd, telLink, waLink } from "@/components/site/parts";

export const generateMetadata = () => pageMeta({ en: "Contact", ur: "رابطہ" });

export default async function Contact() {
  const { site, lang, t, c, preview } = await requireSite();
  const wa = waLink(c.contact.whatsapp);
  const map = /^https:\/\//.test(c.contact.mapUrl) ? c.contact.mapUrl : "";
  const facts: [string, React.ReactNode][] = [];
  if (filled(c.contact.address)) facts.push([t("address"), <span key="a" style={{ whiteSpace: "pre-line" }}>{pick(c.contact.address, lang)}</span>]);
  if (c.contact.phone) facts.push([t("phone"), <a key="p" href={telLink(c.contact.phone)} className="ltr">{c.contact.phone}</a>]);
  if (c.contact.whatsapp && wa) facts.push(["WhatsApp", <a key="w" href={wa} className="ltr" target="_blank" rel="noopener noreferrer">{c.contact.whatsapp}</a>]);
  if (c.contact.email) facts.push([t("email"), <a key="e" href={`mailto:${c.contact.email}`} className="ltr">{c.contact.email}</a>]);
  if (filled(c.contact.hours)) facts.push([t("hours"), <span key="h" style={{ whiteSpace: "pre-line" }}>{pick(c.contact.hours, lang)}</span>]);
  return (
    <>
      <PageHead eyebrow={site.name} title={t("contactTitle")} lead={t("contactText")}>
        <div className="hero-cta" style={{ marginTop: 24 }}>
          {wa && <CTA href={wa} kind="wa">{t("whatsapp")}</CTA>}
          {c.contact.phone && <CTA href={telLink(c.contact.phone)} kind="ghost">{t("call")}</CTA>}
          <CTA href="/admissions/enquiry?visit=1">{t("bookVisit")}</CTA>
        </div>
      </PageHead>
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap">
          {facts.length > 0 ? (
            <div className="facts" style={{ maxWidth: 720 }}>
              {facts.map(([k, v]) => <div key={k} className="fact"><div><b>{k}</b>{v}</div></div>)}
              {map && <div><CTA href={map} kind="navy">{t("openMap")}</CTA></div>}
            </div>
          ) : <ToAdd show={preview}>{t("toAdd")}: address, phone, WhatsApp, email, office hours, Google Maps link.</ToAdd>}
        </div>
      </section>
    </>
  );
}
