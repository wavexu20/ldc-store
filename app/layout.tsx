import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { I18nProvider } from "@/components/i18n-provider";
import { localeMeta } from "@/lib/i18n";
import { getLocale, getTranslator } from "@/lib/i18n-server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Game3DTech";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return {
    title: { default: t("storeMetaTitle", { site: siteName }), template: `%s | ${siteName}` },
    description: t("storeMetaDescription", { site: siteName }),
    keywords: ["digital goods", "software", "AI", "Game3DTech"],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={localeMeta[locale].htmlLang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "globalThis.__name ||= ((target, value) => Object.defineProperty(target, 'name', { value, configurable: true }));" }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <Providers><I18nProvider initialLocale={locale}>{children}</I18nProvider></Providers>
      </body>
    </html>
  );
}
