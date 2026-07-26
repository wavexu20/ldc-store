import type { Locale } from "@/lib/i18n";
import type { AnnouncementTranslations } from "@/lib/db/schema";

type TranslatableAnnouncement = {
  title: string;
  content: string;
  translations?: AnnouncementTranslations | null;
};

export function localizeAnnouncement<T extends TranslatableAnnouncement>(
  announcement: T,
  locale: Locale
): T {
  if (locale === "zh") return announcement;
  const translation = announcement.translations?.[locale] ?? announcement.translations?.en;
  if (!translation) return announcement;
  return {
    ...announcement,
    title: translation.title?.trim() || announcement.title,
    content: translation.content?.trim() || announcement.content,
  };
}
