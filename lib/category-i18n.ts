import type { Locale } from "@/lib/i18n";

const categoryLabels: Record<string, Record<Locale, string>> = {
  "game-accounts": {
    en: "Game accounts", ko: "게임 계정", zh: "游戏账号", ru: "Игровые аккаунты",
    de: "Spielkonten", id: "Akun game", hi: "गेम खाते",
  },
  membership: {
    en: "Membership top-ups", ko: "멤버십 충전", zh: "会员充值", ru: "Пополнение подписок",
    de: "Mitgliedschaften", id: "Isi ulang keanggotaan", hi: "सदस्यता रिचार्ज",
  },
  software: {
    en: "Software licenses", ko: "소프트웨어 라이선스", zh: "软件授权", ru: "Лицензии ПО",
    de: "Softwarelizenzen", id: "Lisensi perangkat lunak", hi: "सॉफ़्टवेयर लाइसेंस",
  },
  ai: {
    en: "AI", ko: "AI", zh: "AI", ru: "ИИ", de: "KI", id: "AI", hi: "AI",
  },
  others: {
    en: "Other", ko: "기타", zh: "其他", ru: "Другое", de: "Weitere",
    id: "Lainnya", hi: "अन्य",
  },
};

export function localizeCategoryName(slug: string, fallbackName: string, locale: Locale): string {
  return categoryLabels[slug.toLowerCase()]?.[locale] || fallbackName;
}

export function localizeCategory<T extends { slug: string; name: string }>(category: T, locale: Locale): T {
  return {
    ...category,
    name: localizeCategoryName(category.slug, category.name, locale),
  };
}

