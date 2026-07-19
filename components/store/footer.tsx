"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

interface FooterProps {
  siteName?: string;
}

export function Footer({ siteName = "Game3DTech" }: FooterProps) {
  const { t } = useI18n();

  function openSupport() {
    window.dispatchEvent(new CustomEvent("game3dtech:open-support"));
  }

  return (
    <footer className="border-t border-border/70 bg-muted/20">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} {siteName}</p>
        <nav aria-label={t("footerNavigation")} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link className="transition-colors hover:text-foreground focus-visible:text-foreground" href="/terms" prefetch={false}>{t("footerTerms")}</Link>
          <Link className="transition-colors hover:text-foreground focus-visible:text-foreground" href="/privacy" prefetch={false}>{t("footerPrivacy")}</Link>
          <Link className="transition-colors hover:text-foreground focus-visible:text-foreground" href="/refund-policy" prefetch={false}>{t("footerRefunds")}</Link>
          <button className="cursor-pointer transition-colors hover:text-foreground focus-visible:text-foreground" type="button" onClick={openSupport}>{t("footerSupport")}</button>
        </nav>
      </div>
    </footer>
  );
}
