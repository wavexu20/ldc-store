"use client";

import Image from "next/image";
import Link from "next/link";
import { FileCheck2, RotateCcw, ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

const paymentMethods = [
  { name: "Visa", src: "/payment-methods/visa.svg" },
  { name: "Mastercard", src: "/payment-methods/mastercard.svg" },
  { name: "Apple Pay", src: "/payment-methods/apple-pay.svg" },
  { name: "Google Pay", src: "/payment-methods/google-pay.svg" },
  { name: "Alipay", src: "/payment-methods/alipay.svg" },
  { name: "USDT", src: "/payment-methods/usdt.svg" },
] as const;

interface FooterProps {
  siteName?: string;
}

export function Footer({ siteName = "Game3DTech" }: FooterProps) {
  const { t } = useI18n();

  return (
    <footer className="border-t border-border/70 bg-muted/20">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} {siteName}</p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
          <nav aria-label={t("footerNavigation")} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground focus-visible:text-foreground" href="/terms" prefetch={false}>
              <FileCheck2 aria-hidden="true" className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
              {t("footerTerms")}
            </Link>
            <Link className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground focus-visible:text-foreground" href="/privacy" prefetch={false}>
              <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {t("footerPrivacy")}
            </Link>
            <Link className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground focus-visible:text-foreground" href="/refund-policy" prefetch={false}>
              <RotateCcw aria-hidden="true" className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              {t("footerRefunds")}
            </Link>
          </nav>
          <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
          <a
            aria-label={t("acceptedPayments")}
            className="flex items-center gap-1.5 rounded-md outline-none ring-offset-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            href="https://pay.game3dtech.com/"
            rel="noreferrer"
            target="_blank"
            title={t("acceptedPayments")}
          >
            {paymentMethods.map((method) => (
              <span className="flex h-5 w-8 items-center justify-center overflow-hidden rounded border border-border/70 bg-white" key={method.name} title={method.name}>
                <Image alt="" aria-hidden="true" className="h-full w-full object-contain" height={20} src={method.src} width={32} />
              </span>
            ))}
          </a>
        </div>
      </div>
    </footer>
  );
}
