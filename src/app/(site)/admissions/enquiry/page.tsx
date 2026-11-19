import { pageMeta, requireSite } from "@/lib/site/load";
import { PageHead, waLink } from "@/components/site/parts";
import { EnquiryForm } from "./form";
import { ui, type UIKey } from "@/lib/site/i18n";

export const generateMetadata = () => pageMeta({ en: "Admission enquiry", ur: "داخلے کی درخواست" });

const KEYS: UIKey[] = ["step1", "step2", "step3", "campus", "klass", "notSure", "childName", "guardianName", "mobile", "mobileHint", "whatNext", "wantVisit", "wantQuestion", "visitDate", "message", "next", "back", "send", "sending", "privacyNote", "thanks", "thanksText", "sendAnother", "stepOf", "errName", "errPhone", "errDate", "errBusy", "errSite", "errGeneric", "errClass", "whatsapp", "goHome"];

export default async function Enquiry({ searchParams }: { searchParams: Promise<{ visit?: string }> }) {
  const { site, lang, t, c } = await requireSite();
  const sp = await searchParams;
  const words = Object.fromEntries(KEYS.map((k) => [k, ui(lang, k)])) as Record<UIKey, string>;
  const wa = waLink(c.contact.whatsapp, lang === "ur" ? "السلام علیکم، مجھے داخلے کے بارے میں معلومات چاہیے۔" : "Assalam o Alaikum, I would like to know about admissions.");
  return (
    <>
      <PageHead eyebrow={t("admissions")} title={t("startEnquiry")} lead={t("privacyNote")} />
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <EnquiryForm campuses={site.campuses} words={words} wantVisit={sp.visit === "1"} whatsapp={wa} preview={site.mode === "preview"} />
        </div>
      </section>
    </>
  );
}
