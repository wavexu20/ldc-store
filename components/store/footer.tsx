"use client";

import Image from "next/image";
import { Languages, ShieldCheck, Zap } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface FooterProps {
  siteName?: string;
}

export function Footer({ siteName = "Game3DTech" }: FooterProps) {
  const { t } = useI18n();
  const strengths = [
    { icon: ShieldCheck, label: t("footerSecurePayment") },
    { icon: Zap, label: t("footerFastDelivery") },
    { icon: Languages, label: t("footerMultilingual") },
  ];

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-zinc-950 text-zinc-200">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(37,99,235,0.18),transparent_34%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/game3dtech-icon.png"
              alt="Game3DTech"
              width={44}
              height={44}
              className="size-11 rounded-xl ring-1 ring-white/15"
            />
            <div>
              <p className="text-base font-semibold tracking-tight text-white">{siteName}</p>
              <p className="mt-0.5 text-xs text-zinc-400 sm:text-sm">{t("footerTagline")}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-3">
            {strengths.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-zinc-300 sm:px-3"
              >
                <Icon className="size-3.5 shrink-0 text-blue-400" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-1.5 border-t border-white/10 pt-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {siteName}</span>
          <span className="font-medium tracking-wide text-zinc-400">game3dtech.com</span>
        </div>
      </div>
    </footer>
  );
}
