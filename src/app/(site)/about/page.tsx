import Link from "next/link";
import { pageMeta, requireSite } from "@/lib/site/load";
import { pick, filled } from "@/lib/site/content";
import { Arrow, CTA, PageHead, Photo, ToAdd } from "@/components/site/parts";

export const generateMetadata = () => pageMeta({ en: "Our School", ur: "ہمارا سکول" });

export default async function About() {
  const { site, lang, t, c, preview } = await requireSite();
  const blocks = [
    { key: "story", title: t("ourStory"), body: c.about.story },
    { key: "mission", title: t("mission"), body: c.about.mission },
    { key: "vision", title: t("vision"), body: c.about.vision },
  ];
  return (
    <>
      <PageHead eyebrow={site.name} title={pick(c.intro.title, lang)} lead={pick(c.intro.text, lang)} />
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap split wide-l">
          <div style={{ display: "grid", gap: 36 }}>
            {blocks.map((b) => filled(b.body) ? (
              <div key={b.key}>
                <h2 className="sh3" style={{ fontSize: "1.5rem" }}>{b.title}</h2>
                <p className="prose" style={{ marginTop: 10 }}>{pick(b.body, lang)}</p>
              </div>
            ) : <ToAdd key={b.key} show={preview}>{t("toAdd")}: {b.title}</ToAdd>)}
            <div className="pillars" style={{ marginTop: 0 }}>
              {c.intro.pillars.map((p, i) => <div key={i} className="pillar" style={{ background: "#fff" }}><b>{pick(p.title, lang)}</b><span>{pick(p.text, lang)}</span></div>)}
            </div>
          </div>
          <Photo src={c.about.image || c.intro.image} alt={site.name} label={t("photoSoon")} tall />
        </div>
      </section>
      <section className="sec sec-white">
        <div className="wrap" style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className="sh2">{t("meetLeaders")}</h2>
            <Link href="/leadership" className="link" style={{ marginTop: 10 }}>{t("leadership")} <Arrow /></Link>
          </div>
          <CTA href="/admissions/enquiry?visit=1">{t("bookVisit")}</CTA>
        </div>
      </section>
    </>
  );
}
