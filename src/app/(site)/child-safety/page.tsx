import { pageMeta, requireSite } from "@/lib/site/load";
import { pick } from "@/lib/site/content";
import { PageHead } from "@/components/site/parts";

export const generateMetadata = () => pageMeta({ en: "Child safety", ur: "بچوں کی حفاظت" });

export default async function ChildSafety() {
  const { site, lang, t, c } = await requireSite();
  return (
    <>
      <PageHead eyebrow={site.name} title={t("childSafety")} />
      <section className="sec" style={{ paddingTop: 0 }}><div className="wrap"><p className="prose">{pick(c.policies.childSafety, lang)}</p></div></section>
    </>
  );
}
