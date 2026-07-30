import { LegalPage } from "@/components/store/legal-page";
import { getTranslator } from "@/lib/i18n-server";

export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("termsTitle"), description: t("termsIntro") };
}

export default async function TermsPage() {
  const { t } = await getTranslator();
  return <LegalPage
    title={t("termsTitle")}
    intro={t("termsIntro")}
    updated={t("legalUpdated")}
    backLabel={t("backToStore")}
    sections={[
      { title: t("termsAccountTitle"), paragraphs: [t("termsAccountBody")] },
      { title: t("termsDeliveryTitle"), paragraphs: [t("termsDeliveryBody")] },
      { title: t("termsPaymentTitle"), paragraphs: [t("termsPaymentBody")] },
      { title: t("termsUseTitle"), paragraphs: [t("termsUseBody")] },
    ]}
  />;
}
