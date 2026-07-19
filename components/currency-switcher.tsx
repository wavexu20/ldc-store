"use client";

import { Check, CircleDollarSign } from "lucide-react";
import { useCurrency } from "@/components/currency-provider";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Currency } from "@/lib/currency";

const options: Array<{ currency: Currency; symbol: string; label: string }> = [
  { currency: "CNY", symbol: "¥", label: "人民币" },
  { currency: "USD", symbol: "$", label: "美元" },
];

export function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency();
  const { locale } = useI18n();
  const selected = options.find((item) => item.currency === currency) ?? options[0];
  const isChinese = locale === "zh";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={isChinese ? `显示货币：${selected.label}` : `Display currency: ${selected.currency}`}
          className="h-8 cursor-pointer gap-1 rounded-full px-2 text-xs font-medium"
          size="sm"
          variant="outline"
        >
          <span aria-hidden="true">{selected.symbol}</span>
          <span className="hidden min-[430px]:inline">{selected.currency}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {options.map((item) => (
          <DropdownMenuItem
            className="cursor-pointer"
            key={item.currency}
            onSelect={() => setCurrency(item.currency)}
          >
            <CircleDollarSign className="size-4" />
            <span className="flex-1">{isChinese ? item.label : item.currency === "CNY" ? "Chinese yuan" : "US dollar"}</span>
            <span className="text-xs text-muted-foreground">{item.currency}</span>
            {currency === item.currency ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
