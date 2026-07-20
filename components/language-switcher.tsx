"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { localeMeta, locales, type Locale } from "@/lib/i18n";
import { useCurrency } from "@/components/currency-provider";
import { currencies, currencySymbols, type Currency } from "@/lib/currency";

const displayCurrencyLabels: Record<Locale, string> = {
  en: "Display currency",
  zh: "显示货币",
  ja: "表示通貨",
  ko: "표시 통화",
  es: "Moneda mostrada",
  de: "Anzeigewährung",
  pt: "Moeda exibida",
  ru: "Валюта отображения",
  id: "Mata uang tampilan",
  hi: "प्रदर्शन मुद्रा",
};

export function Flag({ code, compact = false }: { code: string; compact?: boolean }) {
  const common = `${compact ? "h-4 w-6" : "h-6 w-9"} overflow-hidden rounded-[4px] shadow-sm ring-1 ring-black/10`;
  if (code === "RU") return <span className={`${common} bg-[linear-gradient(#fff_0_33%,#1c57a7_33%_66%,#d52b1e_66%)]`} />;
  if (code === "DE") return <span className={`${common} bg-[linear-gradient(#000_0_33%,#dd0000_33%_66%,#ffce00_66%)]`} />;
  if (code === "ID") return <span className={`${common} bg-[linear-gradient(#e70011_0_50%,#fff_50%)]`} />;
  if (code === "JP") return <span className={`${common} relative bg-white`}><span className="absolute inset-0 m-auto size-3 rounded-full bg-[#bc002d]" /></span>;
  if (code === "ES") return <span className={`${common} bg-[linear-gradient(#aa151b_0_25%,#f1bf00_25%_75%,#aa151b_75%)]`} />;
  if (code === "BR") return <span className={`${common} relative bg-[#009c3b]`}><span className="absolute inset-0 m-auto h-3.5 w-5 rotate-45 bg-[#ffdf00]" /><span className="absolute inset-0 m-auto size-2.5 rounded-full bg-[#002776]" /></span>;
  if (code === "CN") return (
    <span className={common}>
      <svg viewBox="0 0 30 20" className="h-full w-full" role="img" aria-label="中华人民共和国国旗">
        <rect width="30" height="20" fill="#ee1c25" />
        <path fill="#ffde00" d="M5 2 5.8 4.4h2.5L6.2 5.9 7 8.3 5 6.8 3 8.3l.8-2.4-2.1-1.5h2.5Z" />
        <path fill="#ffde00" d="m10.2 1.8.28.86h.9l-.73.53.28.86-.73-.53-.73.53.28-.86-.73-.53h.9Zm2.2 2.25.28.86h.9l-.73.53.28.86-.73-.53-.73.53.28-.86-.73-.53h.9Zm0 3.15.28.86h.9l-.73.53.28.86-.73-.53-.73.53.28-.86-.73-.53h.9Zm-2.2 2.15.28.86h.9l-.73.53.28.86-.73-.53-.73.53.28-.86-.73-.53h.9Z" />
      </svg>
    </span>
  );
  if (code === "IN") return <span className={`${common} relative bg-[linear-gradient(#ff8f1c_0_33%,#fff_33%_66%,#138808_66%)]`}><span className="absolute inset-0 m-auto size-2 rounded-full border border-blue-700" /></span>;
  if (code === "KR") return <span className={`${common} relative bg-white`}><span className="absolute inset-0 m-auto size-3 rounded-full bg-[linear-gradient(135deg,#cd2e3a_0_50%,#0047a0_50%)]" /></span>;
  return <span className={`${common} relative bg-[#21468b]`}><span className="absolute left-1/2 top-0 h-full w-2 -translate-x-1/2 bg-white"/><span className="absolute left-0 top-1/2 h-2 w-full -translate-y-1/2 bg-white"/><span className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 bg-[#cf142b]"/><span className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 bg-[#cf142b]"/></span>;
}

export function LanguageSwitcher({ placement = "floating" }: { placement?: "floating" | "header" }) {
  const { locale, setLocale, t } = useI18n();
  const { currency, setCurrency } = useCurrency();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  function choose(next: Locale) {
    setLocale(next);
    setOpen(false);
    router.refresh();
  }
  function chooseCurrency(next: Currency) {
    setCurrency(next);
    setOpen(false);
  }
  function currencyName(item: Currency) {
    try {
      return new Intl.DisplayNames([locale], { type: "currency" }).of(item) || item;
    } catch {
      return item;
    }
  }
  const inHeader = placement === "header";
  return (
    <div ref={rootRef} className={inHeader ? "relative z-[70]" : "fixed bottom-24 right-4 z-[70] flex flex-col items-end gap-2 sm:bottom-28 sm:right-6"}>
      {open ? (
        <div role="menu" aria-label={inHeader ? `${t("language")} / ${displayCurrencyLabels[locale]}` : t("language")} className={`${inHeader ? "absolute right-0 top-full mt-2 w-[min(19rem,calc(100vw-2rem))]" : ""} max-h-[min(70vh,520px)] overflow-y-auto rounded-2xl border bg-background/95 p-3 shadow-2xl backdrop-blur-xl`}>
          <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">{t("language")}</p>
          <div className={`grid gap-1 ${inHeader ? "grid-cols-4" : "grid-cols-1"}`}>
            {locales.map((item) => (
              <button key={item} role="menuitemradio" aria-checked={locale === item} title={localeMeta[item].name} className={`relative flex cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${inHeader ? "h-12" : "size-12"}`} onClick={() => choose(item)}>
                <Flag code={localeMeta[item].flag} />
                {locale === item ? <span className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-foreground text-background"><Check className="size-2.5" /></span> : null}
              </button>
            ))}
          </div>
          {inHeader ? <>
            <div className="my-3 border-t" />
            <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">{displayCurrencyLabels[locale]}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {currencies.map((item) => (
                <button key={item} role="menuitemradio" aria-checked={currency === item} className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${currency === item ? "bg-foreground text-background hover:bg-foreground/90" : ""}`} onClick={() => chooseCurrency(item)}>
                  <span className="w-5 text-center font-medium" aria-hidden="true">{currencySymbols[item]}</span>
                  <span className="font-medium">{item}</span>
                  <span className={`ml-auto truncate text-xs ${currency === item ? "text-background/70" : "text-muted-foreground"}`}>{currencyName(item)}</span>
                </button>
              ))}
            </div>
          </> : null}
        </div>
      ) : null}
      <button type="button" aria-label={`${t("language")}: ${localeMeta[locale].name}`} aria-expanded={open} className={`flex cursor-pointer items-center rounded-lg border bg-background transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${inHeader ? "h-8 gap-1.5 px-2" : "gap-2 px-2.5 py-2 shadow-lg backdrop-blur-xl"}`} onClick={() => setOpen((value) => !value)}>
        <Flag code={localeMeta[locale].flag} compact={inHeader} />
        {inHeader ? <span className="text-xs font-medium">{currency}</span> : null}
        {inHeader ? <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} /> : <ChevronUp className={`size-4 text-indigo-500 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
    </div>
  );
}
