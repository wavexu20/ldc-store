import type { Metadata } from "next";
import { cache } from "react";
import { Header } from "@/components/store/header";
import { Footer } from "@/components/store/footer";
import { Toaster } from "@/components/ui/sonner";
import { getSystemSettings } from "@/lib/actions/system-settings";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getTranslator } from "@/lib/i18n-server";
import { SupportWidget } from "@/components/store/support-widget";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, oauthAccounts, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { hasVerifiedRealEmail } from "@/lib/email-address";

// 强制动态渲染，避免构建时查询数据库
export const dynamic = "force-dynamic";

// 为什么这样做：同一路由渲染时，layout 的 generateMetadata 与 layout 本体会各自调用一次；用 request 级 memoization 避免重复查库。
const getSystemSettingsCached = cache(getSystemSettings);

export async function generateMetadata(): Promise<Metadata> {
  const { siteName, siteDescription } = await getSystemSettingsCached();
  const { locale } = await getTranslator();

  return {
    title: {
      default: locale === "zh" ? `${siteName} - 自动发卡系统` : `${siteName} - Digital Goods Store`,
      template: `%s | ${siteName}`,
    },
    description: siteDescription,
  };
}

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { siteName, siteIcon, siteIconUrl } = await getSystemSettingsCached();
  const session = await auth();
  if (session?.user?.id && session.user.id !== "admin") {
    const [user, oauth] = await Promise.all([
      db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { email: true, emailVerifiedAt: true } }),
      db.query.oauthAccounts.findFirst({ where: eq(oauthAccounts.userId, session.user.id), columns: { id: true } }),
    ]);
    if (oauth && user && !hasVerifiedRealEmail(user)) redirect("/account/complete-profile");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header siteName={siteName} siteIcon={siteIcon} siteIconUrl={siteIconUrl} />
      <main className="flex-1">{children}</main>
      <Footer siteName={siteName} />
      <LanguageSwitcher />
      <SupportWidget siteName={siteName} />
      <Toaster position="top-center" richColors />
    </div>
  );
}
