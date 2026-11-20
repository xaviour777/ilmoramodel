import { pageMeta, requireSite } from "@/lib/site/load";
import { pick, filled } from "@/lib/site/content";
import { CTA, PageHead, ToAdd, waLink } from "@/components/site/parts";

export const generateMetadata = () => pageMeta({ en: "Admissions", ur: "داخلے" });

export default async function Admissions() {
  const { site, lang, t, c, preview } = await requireSite();
  const wa = waLink(c.contact.whatsapp, lang === "ur" ? "السلام علیکم، مجھے داخلے کے بارے میں معلومات چاہیے۔" : "Assalam o Alaikum, I would like to know about admissions.");
  const classes = [...new Set(site.campuses.flatMap((x) => x.classes.map((k) => k.name)))];
  return (
    <>
      <PageHead eyebrow={c.admissions.open ? t("admissionsOpen") : t("admissions")} title={pick(c.admissions.title, lang)} lead={c.admissions.open ? pick(c.admissions.text, lang) : t("admissionsClosed")}>
        <div className="hero-cta" style={{ marginTop: 24 }}>
          <CTA href="/admissions/enquiry">{t("startEnquiry")}</CTA>
          <CTA href="/admissions/enquiry?visit=1" kind="ghost">{t("bookVisit")}</CTA>
          {wa && <CTA href={wa} kind="wa">{t("whatsapp")}</CTA>}
        </div>
      </PageHead>
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap split" style={{ alignItems: "start" }}>
          <div>
            <h2 className="sh3" style={{ fontSize: "1.5rem", marginBottom: 16 }}>{t("howItWorks")}</h2>
            <ol className="steps light"><li>{t("step1")}</li><li>{t("step2")}</li><li>{t("step3")}</li><li>{t("step4")}</li></ol>
          </div>
          <div style={{ display: "grid", gap: 20 }}>
            <div>
              <h2 className="sh3" style={{ fontSize: "1.5rem", marginBottom: 10 }}>{t("requirements")}</h2>
              {filled(c.admissions.requirements) ? <p className="prose">{pick(c.admissions.requirements, lang)}</p> : <ToAdd show={preview}>{t("toAdd")}: {t("requirements")}</ToAdd>}
            </div>
            {classes.length > 0 && (
              <div>
                <h2 className="sh3" style={{ marginBottom: 10 }}>{t("klass")}</h2>
                <div className="schips">{classes.map((k) => <span key={k} className="schip" style={{ display: "inline-flex", alignItems: "center", cursor: "default" }}>{k}</span>)}</div>
              </div>
            )}
            {filled(c.admissions.note) && <p className="soft prose">{pick(c.admissions.note, lang)}</p>}
          </div>
        </div>
      </section>
    </>
  );
}
