import Link from "next/link";
import { getLang } from "@/lib/site/load";
import { translator } from "@/lib/site/i18n";

export default async function NotFound() {
  const t = translator(await getLang());
  return (
    <section className="phead"><div className="wrap" style={{ display: "grid", gap: 16 }}>
      <h1>{t("notFound")}</h1>
      <Link href="/" className="link">{t("goHome")}</Link>
    </div></section>
  );
}
