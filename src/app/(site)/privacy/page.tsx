import { pageMeta, requireSite } from "@/lib/site/load";
import { pick } from "@/lib/site/content";
import { PageHead } from "@/components/site/parts";

export const generateMetadata = () => pageMeta({ en: "Privacy policy", ur: "پرائیویسی پالیسی" });

export default async function Privacy() {
  const { site, lang, t, c } = await requireSite();
  return (
    <>
      <PageHead eyebrow={site.name} title={t("privacy")} />
      <section className="sec" style={{ paddingTop: 0 }}><div className="wrap"><p className="prose">{pick(c.policies.privacy, lang)}</p></div></section>
    </>
  );
}
