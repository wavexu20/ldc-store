import { LegalPage } from "@/components/store/legal-page";
import { getTranslator } from "@/lib/i18n-server";

export async function generateMetadata() {
  const { t } = await getTranslator();
  return { title: t("privacyTitle"), description: t("privacyIntro") };
}

export default async function PrivacyPage() {
  const { t } = await getTranslator();
  return <LegalPage
    title={t("privacyTitle")}
    intro={t("privacyIntro")}
    updated={t("legalUpdated")}
    backLabel={t("backToStore")}
    sections={[
      { title: t("privacyCollectionTitle"), paragraphs: [t("privacyCollectionBody")] },
      { title: t("privacyPurposeTitle"), paragraphs: [t("privacyPurposeBody")] },
      { title: t("privacyRetentionTitle"), paragraphs: [t("privacyRetentionBody")] },
      { title: t("privacyChoicesTitle"), paragraphs: [t("privacyChoicesBody")] },
    ]}
  />;
}
