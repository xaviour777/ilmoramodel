import { pageMeta, requireSite } from "@/lib/site/load";
import { pick, visibleShowcase, CATEGORY_UR } from "@/lib/site/content";
import { PageHead, Photo } from "@/components/site/parts";

export const generateMetadata = () => pageMeta({ en: "Student Life", ur: "طلبہ کی زندگی" });

export default async function StudentLife() {
  const { lang, t, c } = await requireSite();
  const projects = visibleShowcase(c.projects);
  const cat = (k: string) => (lang === "ur" ? CATEGORY_UR[k] ?? k : k);
  return (
    <>
      <PageHead eyebrow={t("studentLife")} title={pick(c.day.title, lang)} lead={pick(c.day.text, lang)} />
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap split">
          <ol className="tl">
            {c.day.items.map((d, i) => (
              <li key={i}><span className="dot" aria-hidden /><div>{d.time && <small className="ltr" style={{ color: "var(--ms-mint-ink)" }}>{d.time}</small>}<b style={{ color: "var(--ms-navy)" }}>{pick(d.title, lang)}</b><span className="soft">{pick(d.text, lang)}</span></div></li>
            ))}
          </ol>
          <Photo src={c.day.image} alt={pick(c.day.title, lang)} label={t("photoSoon")} tall />
        </div>
      </section>
      <section id="projects" className="sec sec-white" style={{ scrollMarginTop: 80 }}>
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker">{t("madeAtModel")}</div>
            <h2 className="sh2">{t("madeAtModel")}</h2>
            <p className="lead">{t("madeAtModelText")}</p>
          </div>
          {projects.length > 0 ? (
            <div className="show">
              {projects.map((p, i) => (
                <article key={i} className="show-card">
                  <Photo src={p.image} alt={pick(p.title, lang)} label={cat(p.category)} />
                  <div className="body"><span className="tag">{cat(p.category)}</span><h3 className="sh3">{pick(p.title, lang)}</h3><p className="soft" style={{ margin: 0 }}>{pick(p.text, lang)}</p></div>
                </article>
              ))}
            </div>
          ) : <div className="empty">{t("noProjects")}</div>}
        </div>
      </section>
    </>
  );
}
