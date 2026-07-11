import { Toaster } from "@/components/ui/sonner";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-hidden">
      {children}
      <LanguageSwitcher />
      <Toaster position="top-center" richColors />
    </div>
  );
}
