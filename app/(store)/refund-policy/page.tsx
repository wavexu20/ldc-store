import { LegalPage } from "@/components/store/legal-page";
import { getTranslator } from "@/lib/i18n-server";

export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("refundTitle"), description: t("refundIntro") };
}

export default async function RefundPolicyPage() {
  const { t } = await getTranslator();
  return <LegalPage
    title={t("refundTitle")}
    intro={t("refundIntro")}
    updated={t("legalUpdated")}
    backLabel={t("backToStore")}
    sections={[
      { title: t("refundSubmitTitle"), paragraphs: [t("refundSubmitBody")] },
      { title: t("refundUndeliveredTitle"), paragraphs: [t("refundUndeliveredBody")] },
      { title: t("refundDeliveredTitle"), paragraphs: [t("refundDeliveredBody")] },
      { title: t("refundResultTitle"), paragraphs: [t("refundResultBody")] },
    ]}
  />;
}
