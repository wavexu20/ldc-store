import type { Locale } from "@/lib/i18n";

const categoryLabels: Record<string, Record<Locale, string>> = {
  "game-accounts": {
    en: "Game accounts", zh: "游戏账号", ja: "ゲームアカウント", ko: "게임 계정",
    es: "Cuentas de juego", de: "Spielkonten", pt: "Contas de jogos", ru: "Игровые аккаунты",
    id: "Akun game", hi: "गेम खाते",
  },
  membership: {
    en: "Membership top-ups", zh: "会员充值", ja: "メンバーシップチャージ", ko: "멤버십 충전",
    es: "Recargas de membresía", de: "Mitgliedschaften", pt: "Recargas de assinatura", ru: "Пополнение подписок",
    id: "Isi ulang keanggotaan", hi: "सदस्यता रिचार्ज",
  },
  software: {
    en: "Software licenses", zh: "软件授权", ja: "ソフトウェアライセンス", ko: "소프트웨어 라이선스",
    es: "Licencias de software", de: "Softwarelizenzen", pt: "Licenças de software", ru: "Лицензии ПО",
    id: "Lisensi perangkat lunak", hi: "सॉफ़्टवेयर लाइसेंस",
  },
  ai: {
    en: "AI", zh: "AI", ja: "AI", ko: "AI", es: "IA", de: "KI", pt: "IA", ru: "ИИ", id: "AI", hi: "AI",
  },
  others: {
    en: "Other", zh: "其他", ja: "その他", ko: "기타", es: "Otros", de: "Weitere",
    pt: "Outros", ru: "Другое", id: "Lainnya", hi: "अन्य",
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
