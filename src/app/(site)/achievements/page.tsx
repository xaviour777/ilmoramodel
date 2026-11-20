import { pageMeta, requireSite } from "@/lib/site/load";
import { pick, visibleShowcase, CATEGORY_UR, ACHIEVEMENT_CATEGORIES } from "@/lib/site/content";
import { PageHead, Photo, Tick } from "@/components/site/parts";

export const generateMetadata = () => pageMeta({ en: "Achievements", ur: "کامیابیاں" });

export default async function Achievements({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { lang, t, c } = await requireSite();
  const sp = await searchParams;
  const all = visibleShowcase(c.achievements);
  const cats = ACHIEVEMENT_CATEGORIES.filter((k) => all.some((a) => a.category === k));
  const shown = sp.c && cats.includes(sp.c) ? all.filter((a) => a.category === sp.c) : all;
  const cat = (k: string) => (lang === "ur" ? CATEGORY_UR[k] ?? k : k);
  return (
    <>
      <PageHead eyebrow={t("achievements")} title={t("achievers")} lead={t("achieversText")}>
        {cats.length > 1 && (
          <nav className="schips" style={{ marginTop: 24 }} aria-label={t("achievements")}>
            <a href="/achievements" className="schip" aria-current={!sp.c ? "page" : undefined} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{lang === "ur" ? "سب" : "All"}</a>
            {cats.map((k) => <a key={k} href={`/achievements?c=${encodeURIComponent(k)}`} className="schip" aria-current={sp.c === k ? "page" : undefined} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>{cat(k)}</a>)}
          </nav>
        )}
      </PageHead>
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap">
          {shown.length > 0 ? (
            <div className="show">
              {shown.map((a, i) => (
                <article key={i} className="show-card">
                  <Photo src={a.image} alt={pick(a.title, lang)} label={cat(a.category)} />
                  <div className="body">
                    <span className="tag gold">{cat(a.category)}</span>
                    <h2 className="sh3">{pick(a.title, lang)}</h2>
                    <p className="soft" style={{ margin: 0 }}>{pick(a.text, lang)}</p>
                    <span className="tag"><Tick size={14} /> {t("verified")}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="empty">{t("noAchievements")}</div>}
        </div>
      </section>
    </>
  );
}
