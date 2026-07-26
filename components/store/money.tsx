"use client";

import { useCurrency } from "@/components/currency-provider";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

export function Money({
  amount,
  cents = false,
  className,
}: {
  amount: number | string;
  cents?: boolean;
  className?: string;
}) {
  const { formatCny, formatCnyCents } = useCurrency();
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return null;
  const formatted = cents ? formatCnyCents(numeric) : formatCny(numeric);
  return <span className={cn("tabular-nums", className)}>{formatted}</span>;
}

export function CnySettlementHint({ amount, className }: { amount: number | string; className?: string }) {
  const { currency } = useCurrency();
  const { t } = useI18n();
  if (currency === "CNY") return null;
  return <span className={cn("text-xs text-muted-foreground", className)}>{t("settledAs")} ¥{Number(amount).toFixed(2)} CNY</span>;
}
