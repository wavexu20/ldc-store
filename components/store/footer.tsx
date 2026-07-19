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
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-3 px-4 py-4 text-xs text-muted-foreground md:grid-cols-[1fr_auto_1fr]">
        <p className="text-center md:text-left">© {new Date().getFullYear()} {siteName}</p>
        <a
          aria-label={t("acceptedPayments")}
          className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-xl outline-none ring-offset-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href="https://pay.game3dtech.com/"
          rel="noreferrer"
          target="_blank"
          title={t("acceptedPayments")}
        >
          {paymentMethods.map((method) => (
            <span className="flex h-7 w-11 items-center justify-center overflow-hidden rounded-md border border-border/80 bg-white px-0.5 shadow-sm" key={method.name} title={method.name}>
              <Image alt="" aria-hidden="true" className="h-full w-full object-contain" height={28} src={method.src} width={44} />
            </span>
          ))}
        </a>
        <nav aria-label={t("footerNavigation")} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 md:justify-self-end">
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
      </div>
    </footer>
  );
}
