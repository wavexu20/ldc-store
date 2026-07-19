"use client";

import Image from "next/image";
import { useI18n } from "@/components/i18n-provider";

interface FooterProps {
  siteName?: string;
}

export function Footer({ siteName = "Game3DTech" }: FooterProps) {
  const { t } = useI18n();
  return (
    <footer className="relative border-t bg-background">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/45 to-transparent" />
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/brand/game3dtech-icon.png"
              alt="Game3DTech"
              width={32}
              height={32}
              className="size-8 shrink-0 rounded-lg ring-1 ring-border"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">{siteName}</p>
              <p className="truncate text-xs text-muted-foreground">{t("footerTagline")}</p>
            </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:justify-end">
          <span>© {new Date().getFullYear()} {siteName}</span>
          <span aria-hidden="true" className="text-border">/</span>
          <span className="font-medium text-foreground/70">game3dtech.com</span>
        </div>
      </div>
    </footer>
  );
}
