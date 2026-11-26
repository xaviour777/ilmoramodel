import { pageMeta, requireSite } from "@/lib/site/load";
import { pick } from "@/lib/site/content";
import { AreaIcon, CTA, PageHead, Photo } from "@/components/site/parts";

export const generateMetadata = () => pageMeta({ en: "Learning", ur: "تعلیم" });

export default async function Academics() {
  const { lang, t, c } = await requireSite();
  return (
    <>
      <PageHead eyebrow={t("learning")} title={t("learningTitle")} lead={t("learningText")}>
        <nav aria-label={t("allAreas")} className="schips" style={{ marginTop: 24 }}>
          {c.areas.map((a) => <a key={a.key} href={`#${a.key}`} className="schip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{pick(a.title, lang)}</a>)}
        </nav>
      </PageHead>
      {c.areas.map((a, i) => (
        <section key={a.key} id={a.key} className={`sec${i % 2 === 0 ? " sec-white" : ""}`} style={{ scrollMarginTop: 80 }}>
          <div className="wrap split">
            <div style={{ order: i % 2 }}>
              <AreaIcon k={a.key} />
              <h2 className="sh2" style={{ marginTop: 16 }}>{pick(a.title, lang)}</h2>
              <p className="lead" style={{ marginTop: 12 }}>{pick(a.short, lang)}</p>
              <p className="prose" style={{ marginTop: 16 }}>{pick(a.body, lang)}</p>
              {a.key === "technology" && <div style={{ marginTop: 20 }}><CTA href="/future-skills" kind="navy">{t("exploreLab")}</CTA></div>}
            </div>
            <Photo src={a.image} alt={pick(a.title, lang)} label={t("photoSoon")} />
          </div>
        </section>
      ))}
    </>
  );
}
