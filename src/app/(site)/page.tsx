import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe, homeFor } from "@/lib/me";
import { isSuper } from "@/lib/super";
import { getLang, getSite } from "@/lib/site/load";
import { pick, filled, visibleShowcase, CATEGORY_UR } from "@/lib/site/content";
import { translator } from "@/lib/site/i18n";
import { AreaIcon, Arrow, CTA, Photo, Tick, ToAdd } from "@/components/site/parts";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  if (!site) return {};
  const lang = await getLang();
  return {
    title: { absolute: `${site.name} — ${pick(site.content.hero.title, lang)}` },
    description: pick(site.content.seo.description, lang),
    openGraph: { title: site.name, description: pick(site.content.seo.description, lang), images: site.content.hero.image ? [site.content.hero.image] : undefined },
  };
}

export default async function Home() {
  const site = await getSite();
  if (!site) {
    // the app's own address: straight to the right dashboard, as before
    if (await isSuper()) redirect("/super");
    const me = await getMe();
    redirect(homeFor(me.role));
  }
  const lang = await getLang();
  const t = translator(lang);
  const c = site.content;
  const preview = site.mode === "preview";
  const projects = visibleShowcase(c.projects).slice(0, 3);
  const achievements = visibleShowcase(c.achievements).slice(0, 3);
  const cat = (k: string) => (lang === "ur" ? CATEGORY_UR[k] ?? k : k);

  return (
    <>
      {/* 1. Hero */}
      <section className="hero">
        {c.hero.video ? (
          <div className="hero-media"><video src={c.hero.video} poster={c.hero.image || undefined} autoPlay muted loop playsInline preload="metadata" aria-hidden /></div>
        ) : c.hero.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <div className="hero-media"><img src={c.hero.image} alt="" fetchPriority="high" /></div>
        ) : (
          <div className="hero-art" aria-hidden>
            <svg viewBox="0 0 600 600" fill="none">
              <path d="M40 520C160 470 210 360 300 300S470 210 560 80" stroke="#12B89B" strokeWidth="2" />
              <path d="M40 560C190 520 250 400 340 340S500 260 580 140" stroke="#12B89B" strokeWidth="1.2" opacity=".6" />
              <path d="M20 470C120 430 170 330 250 260S400 160 470 40" stroke="#F3B94B" strokeWidth="1.2" opacity=".7" />
              <circle cx="300" cy="300" r="6" fill="#12B89B" /><circle cx="470" cy="190" r="4" fill="#F3B94B" /><circle cx="560" cy="80" r="8" fill="#12B89B" />
            </svg>
          </div>
        )}
        <div className="wrap hero-in reveal">
          <div className="kicker">{pick(c.hero.eyebrow, lang)}</div>
          <h1 className="display">{pick(c.hero.title, lang)}</h1>
          {lang === "en" && c.hero.title.ur && <div className="hero-urdu" lang="ur" dir="rtl">ماڈل سکول — جہاں مستقبل کی تیاری آج سے شروع ہوتی ہے۔</div>}
          <p className="lead">{pick(c.hero.text, lang)}</p>
          <div className="hero-cta">
            <CTA href="/about">{t("explore")}</CTA>
            <CTA href="/admissions/enquiry?visit=1" kind="light">{t("bookVisit")}</CTA>
          </div>
        </div>
      </section>
      {preview && !c.hero.image && <div className="wrap" style={{ marginTop: 16 }}><ToAdd show>{t("toAdd")}: hero photo or short school film (Settings → Website → Hero).</ToAdd></div>}

      {/* 2. A school that believes in every child */}
      <section className="sec">
        <div className="wrap split wide-l">
          <div className="reveal">
            <div className="kicker">{t("everyChild")}</div>
            <h2 className="sh2" style={{ marginTop: 12 }}>{pick(c.intro.title, lang)}</h2>
            <p className="lead" style={{ marginTop: 16 }}>{pick(c.intro.text, lang)}</p>
            <div className="pillars">
              {c.intro.pillars.map((p, i) => (
                <div key={i} className="pillar"><b>{pick(p.title, lang)}</b><span>{pick(p.text, lang)}</span></div>
              ))}
            </div>
          </div>
          <Photo src={c.intro.image} alt={pick(c.intro.title, lang)} label={t("photoSoon")} tall />
        </div>
      </section>

      {/* principal's welcome */}
      {(filled(c.principal.message) || preview) && (
        <section className="sec sec-white">
          <div className="wrap split">
            <Photo src={c.principal.photo} video={c.principal.video} alt={c.principal.name || pick(c.principal.title, lang)} label={t("photoSoon")} />
            <div>
              <div className="kicker">{pick(c.principal.title, lang) || t("principalWord")}</div>
              {filled(c.principal.message) ? (
                <>
                  <blockquote className="quote" style={{ margin: "16px 0 0" }}>{pick(c.principal.message, lang).split("\n\n")[0]}</blockquote>
                  {c.principal.name && <div className="quote-by">{c.principal.name}</div>}
                  <div style={{ marginTop: 20 }}><Link href="/leadership" className="link">{t("readMore")} <Arrow /></Link></div>
                </>
              ) : (
                <div style={{ marginTop: 16 }}><ToAdd show>{t("toAdd")}: principal&apos;s message and name.</ToAdd></div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 3. Learning for tomorrow */}
      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker">{t("learning")}</div>
            <h2 className="sh2">{t("learningTitle")}</h2>
            <p className="lead">{t("learningText")}</p>
          </div>
          <div className="cards">
            {c.areas.map((a, i) => (
              <Link key={a.key} href={`/academics#${a.key}`} className="scard">
                <AreaIcon k={a.key} />
                <span className="num">0{i + 1}</span>
                <h3 className="sh3">{pick(a.title, lang)}</h3>
                <p>{pick(a.short, lang)}</p>
                <span className="go link">{t("readMore")} <Arrow /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Made at Model */}
      {(projects.length > 0 || preview) && (
        <section className="sec sec-white">
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
                    <div className="body">
                      <span className="tag">{cat(p.category)}</span>
                      <h3 className="sh3">{pick(p.title, lang)}</h3>
                      <p className="soft" style={{ margin: 0 }}>{pick(p.text, lang)}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : <div className="empty">{t("noProjects")}</div>}
            <div style={{ marginTop: 24 }}><Link href="/student-life#projects" className="link">{t("viewProjects")} <Arrow /></Link></div>
          </div>
        </section>
      )}

      {/* 5. Model Achievers */}
      {(achievements.length > 0 || preview) && (
        <section className="sec">
          <div className="wrap">
            <div className="sec-head">
              <div className="kicker">{t("achievements")}</div>
              <h2 className="sh2">{t("achievers")}</h2>
              <p className="lead">{t("achieversText")}</p>
            </div>
            {achievements.length > 0 ? (
              <div className="show">
                {achievements.map((a, i) => (
                  <article key={i} className="show-card">
                    <Photo src={a.image} alt={pick(a.title, lang)} label={cat(a.category)} />
                    <div className="body">
                      <span className="tag gold">{cat(a.category)}</span>
                      <h3 className="sh3">{pick(a.title, lang)}</h3>
                      <p className="soft" style={{ margin: 0 }}>{pick(a.text, lang)}</p>
                      <span className="tag"><Tick size={14} /> {t("verified")}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : <div className="empty">{t("noAchievements")}</div>}
            <div style={{ marginTop: 24 }}><Link href="/achievements" className="link">{t("achievements")} <Arrow /></Link></div>
          </div>
        </section>
      )}

      {/* 6. A day at Model */}
      <section className="sec sec-navy">
        <div className="wrap split">
          <div>
            <div className="kicker">{t("studentLife")}</div>
            <h2 className="sh2" style={{ marginTop: 12 }}>{pick(c.day.title, lang)}</h2>
            <p className="lead" style={{ marginTop: 12, marginBottom: 28 }}>{pick(c.day.text, lang)}</p>
            <ol className="tl">
              {c.day.items.map((d, i) => (
                <li key={i}><span className="dot" aria-hidden /><div>{d.time && <small className="ltr">{d.time}</small>}<b>{pick(d.title, lang)}</b><span className="soft">{pick(d.text, lang)}</span></div></li>
              ))}
            </ol>
          </div>
          <Photo src={c.day.image} alt={pick(c.day.title, lang)} label={t("photoSoon")} tall />
        </div>
      </section>

      {/* 7. Model AI Lab */}
      <section className="sec">
        <div className="wrap split">
          <Photo src={c.aiLab.image} alt={pick(c.aiLab.title, lang)} label={t("photoSoon")} />
          <div>
            <div className="kicker">{t("learnBeyond")}</div>
            <h2 className="sh2" style={{ marginTop: 12 }}>{pick(c.aiLab.title, lang)}</h2>
            <p className="lead" style={{ marginTop: 14 }}>{pick(c.aiLab.text, lang)}</p>
            <ul className="ticks">
              {c.aiLab.points.map((p, i) => <li key={i}><Tick /><span>{pick(p, lang)}</span></li>)}
            </ul>
            <div className="hero-cta" style={{ marginTop: 24 }}>
              <CTA href="/future-skills" kind="navy">{t("exploreLab")}</CTA>
              <CTA href="/student-life#projects" kind="ghost">{t("viewProjects")}</CTA>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Admissions */}
      <section className="sec sec-white">
        <div className="wrap">
          <div className="adm">
            <div>
              <div className="kicker" style={{ color: "var(--ms-mint)" }}>{c.admissions.open ? t("admissionsOpen") : t("admissions")}</div>
              <h2 className="sh2" style={{ marginTop: 12 }}>{pick(c.admissions.title, lang)}</h2>
              <p className="lead" style={{ marginTop: 14 }}>{c.admissions.open ? pick(c.admissions.text, lang) : t("admissionsClosed")}</p>
              <div className="hero-cta" style={{ marginTop: 22 }}>
                <CTA href="/admissions/enquiry">{t("startEnquiry")}</CTA>
                <CTA href="/admissions" kind="light">{t("readMore")}</CTA>
              </div>
            </div>
            <ol className="steps">
              <li>{t("step1")}</li><li>{t("step2")}</li><li>{t("step3")}</li><li>{t("step4")}</li>
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}
