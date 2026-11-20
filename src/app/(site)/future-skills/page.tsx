import { pageMeta, requireSite } from "@/lib/site/load";
import { pick, visibleShowcase, CATEGORY_UR } from "@/lib/site/content";
import { CTA, PageHead, Photo, Tick } from "@/components/site/parts";

export const generateMetadata = () => pageMeta({ en: "Future Skills · Model AI Lab", ur: "مستقبل کی مہارتیں · ماڈل اے آئی لیب" });

export default async function FutureSkills() {
  const { lang, t, c } = await requireSite();
  const tech = visibleShowcase(c.projects).filter((p) => ["AI-assisted project", "Coding", "Video"].includes(p.category));
  return (
    <>
      <PageHead eyebrow={t("futureSkills")} title={pick(c.aiLab.title, lang)} lead={pick(c.aiLab.text, lang)} />
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap split">
          <div>
            <h2 className="sh3" style={{ fontSize: "1.5rem" }}>{t("learnBeyond")}</h2>
            <ul className="ticks">{c.aiLab.points.map((p, i) => <li key={i}><Tick /><span>{pick(p, lang)}</span></li>)}</ul>
          </div>
          <Photo src={c.aiLab.image} alt={pick(c.aiLab.title, lang)} label={t("photoSoon")} />
        </div>
      </section>
      {tech.length > 0 && (
        <section className="sec sec-white">
          <div className="wrap">
            <h2 className="sh2" style={{ marginBottom: 28 }}>{t("madeAtModel")}</h2>
            <div className="show">
              {tech.map((p, i) => (
                <article key={i} className="show-card">
                  <Photo src={p.image} alt={pick(p.title, lang)} label={p.category} />
                  <div className="body"><span className="tag">{lang === "ur" ? CATEGORY_UR[p.category] ?? p.category : p.category}</span><h3 className="sh3">{pick(p.title, lang)}</h3><p className="soft" style={{ margin: 0 }}>{pick(p.text, lang)}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="sec">
        <div className="wrap" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <CTA href="/academics">{t("allAreas")}</CTA>
          <CTA href="/admissions/enquiry?visit=1" kind="ghost">{t("bookVisit")}</CTA>
        </div>
      </section>
    </>
  );
}
