import { Toaster } from "@/components/ui/sonner";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SupportWidget } from "@/components/store/support-widget";
import { getSystemSettings } from "@/lib/actions/system-settings";

export const dynamic = "force-dynamic";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { siteName } = await getSystemSettings();
  return (
    <div className="h-full overflow-hidden">
      {children}
      <LanguageSwitcher />
      <SupportWidget siteName={siteName} />
      <Toaster position="top-center" richColors />
    </div>
  );
}
