"use client";

import { useCallback, useEffect, useRef } from "react";
import Script from "next/script";

type TurnstileApi = {
  render(container: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: "auto";
    size: "flexible";
    callback(token: string): void;
    "expired-callback"(): void;
    "error-callback"(): void;
  }): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

export function TurnstileWidget({
  siteKey,
  onVerify,
}: {
  siteKey: string;
  onVerify(token: string | null): void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  const renderWidget = useCallback(() => {
    if (!window.turnstile || !containerRef.current || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action: "register",
      theme: "auto",
      size: "flexible",
      callback: (token) => onVerifyRef.current(token),
      "expired-callback": () => onVerifyRef.current(null),
      "error-callback": () => onVerifyRef.current(null),
    });
  }, [siteKey]);

  useEffect(() => {
    renderWidget();
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  return (
    <>
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <div ref={containerRef} className="min-h-[65px] w-full" aria-label="Cloudflare 人机验证" />
    </>
  );
}
