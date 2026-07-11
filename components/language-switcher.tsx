"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { localeMeta, locales, type Locale } from "@/lib/i18n";

function Flag({ code }: { code: string }) {
  const common = "h-6 w-9 overflow-hidden rounded-[4px] shadow-sm ring-1 ring-black/10";
  if (code === "RU") return <span className={`${common} bg-[linear-gradient(#fff_0_33%,#1c57a7_33%_66%,#d52b1e_66%)]`} />;
  if (code === "DE") return <span className={`${common} bg-[linear-gradient(#000_0_33%,#dd0000_33%_66%,#ffce00_66%)]`} />;
  if (code === "ID") return <span className={`${common} bg-[linear-gradient(#e70011_0_50%,#fff_50%)]`} />;
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

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
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
  return (
    <div ref={rootRef} className="fixed bottom-24 right-4 z-[70] flex flex-col items-end gap-2 sm:bottom-28 sm:right-6">
      {open ? (
        <div role="menu" aria-label={t("language")} className="flex max-h-[min(70vh,480px)] flex-col gap-1.5 overflow-y-auto rounded-[1.35rem] border bg-background/95 p-2.5 shadow-2xl backdrop-blur-xl">
          {locales.map((item) => (
            <button key={item} role="menuitemradio" aria-checked={locale === item} title={localeMeta[item].name} className="relative flex size-12 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => choose(item)}>
              <Flag code={localeMeta[item].flag} />
              {locale === item ? <span className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full bg-indigo-500 text-white"><Check className="size-2.5" /></span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <button type="button" aria-label={`${t("language")}: ${localeMeta[locale].name}`} aria-expanded={open} className="flex cursor-pointer items-center gap-2 rounded-xl border bg-background/95 px-2.5 py-2 shadow-lg backdrop-blur-xl transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setOpen((value) => !value)}>
        <Flag code={localeMeta[locale].flag} />
        <ChevronUp className={`size-4 text-indigo-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}
