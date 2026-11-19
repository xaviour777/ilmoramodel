import { pageMeta, requireSite } from "@/lib/site/load";
import { pick, filled } from "@/lib/site/content";
import { PageHead, Photo, ToAdd } from "@/components/site/parts";

export const generateMetadata = () => pageMeta({ en: "Leadership", ur: "قیادت" });

export default async function Leadership() {
  const { lang, t, c, preview } = await requireSite();
  const people = c.leadership.filter((p) => p.name.trim());
  return (
    <>
      <PageHead eyebrow={t("leadership")} title={t("meetLeaders")} />
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap split">
          <Photo src={c.principal.photo} video={c.principal.video} alt={c.principal.name || t("principalWord")} label={t("photoSoon")} tall />
          <div>
            <div className="kicker">{pick(c.principal.title, lang) || t("principalWord")}</div>
            {filled(c.principal.message) ? (
              <>
                <div className="quote" style={{ marginTop: 16 }}>{pick(c.principal.message, lang)}</div>
                {c.principal.name && <div className="quote-by">{c.principal.name}</div>}
              </>
            ) : <div style={{ marginTop: 16 }}><ToAdd show={preview}>{t("toAdd")}: principal&apos;s message and name.</ToAdd></div>}
          </div>
        </div>
      </section>
      {(people.length > 0 || preview) && (
        <section className="sec sec-white">
          <div className="wrap">
            {people.length > 0 ? (
              <div className="people">
                {people.map((p, i) => (
                  <article key={i} className="show-card">
                    <Photo src={p.photo} alt={p.name} label={p.name} />
                    <div className="body">
                      <h3 className="sh3">{p.name}</h3>
                      <span className="tag">{pick(p.role, lang)}</span>
                      {filled(p.bio) && <p className="soft" style={{ margin: 0 }}>{pick(p.bio, lang)}</p>}
                    </div>
                  </article>
                ))}
              </div>
            ) : <ToAdd show>{t("toAdd")}: leadership team (Settings → Website → Leadership).</ToAdd>}
          </div>
        </section>
      )}
    </>
  );
}
