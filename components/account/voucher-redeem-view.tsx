"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift, Loader2, Ticket, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { redeemVoucher } from "@/lib/actions/vouchers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";

type VoucherItem = {
  id: string;
  code: string;
  type: "recharge" | "product" | "discount";
  status: "claimed" | "reserved" | "redeemed";
  rechargeAmountCents: number;
  discountAmountCents: number;
  minOrderCents: number;
  productName: string | null;
  expiresAt: Date | null;
  redeemedAt: Date | null;
  createdAt: Date;
  expired: boolean;
};

export function VoucherRedeemView({ items }: { items: VoucherItem[] }) {
  const { locale, t } = useI18n();
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const labelFor = (type: VoucherItem["type"]) => type === "recharge" ? t("rechargeVoucher") : type === "product" ? t("productVoucher") : t("discountVoucher");
  const detailFor = (item: VoucherItem) => item.type === "recharge"
    ? t("voucherCreditAmount", { amount: `¥${(item.rechargeAmountCents / 100).toFixed(2)}` })
    : item.type === "product"
      ? item.productName || t("specifiedProduct")
      : t("voucherDiscountDetail", { minimum: `¥${(item.minOrderCents / 100).toFixed(2)}`, discount: `¥${(item.discountAmountCents / 100).toFixed(2)}` });

  function redeem() {
    startTransition(async () => {
      const result = await redeemVoucher(code);
      if (!result.success) {
        if (result.requiresSecondFactor) {
          router.push("/account/verify-2fa?callbackUrl=%2Faccount%2Fvouchers");
          return;
        }
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setCode("");
      router.refresh();
      if (result.orderNo) router.push(`/order/result?out_trade_no=${encodeURIComponent(result.orderNo)}`);
    });
  }

  return <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-10">
    <div><h1 className="text-2xl font-semibold tracking-tight">{t("voucherTitle")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("voucherDescription")}</p></div>
    <Card className="border shadow-sm"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Ticket className="size-5" /></div><Input aria-label={t("voucherCode")} className="h-11 font-mono uppercase tracking-[0.08em]" placeholder="G3D-XXXX-XXXX-XXXX-XXXX" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") redeem(); }} /><Button className="h-11 shrink-0" disabled={pending || !code.trim()} onClick={redeem}>{pending ? <Loader2 className="animate-spin" /> : <Ticket />}{t("redeemNow")}</Button></CardContent></Card>

    <div className="grid gap-3 sm:grid-cols-3"><Info icon={WalletCards} title={t("rechargeVoucher")} description={t("rechargeVoucherDescription")} /><Info icon={Gift} title={t("productVoucher")} description={t("productVoucherDescription")} /><Info icon={Ticket} title={t("discountVoucher")} description={t("discountVoucherDescription")} /></div>

    <Card><CardHeader><CardTitle className="text-lg">{t("myVouchers")}</CardTitle><CardDescription>{t("myVouchersDescription")}</CardDescription></CardHeader><CardContent>{items.length === 0 ? <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><Ticket className="size-5" />{t("noVouchers")}</div> : <div className="divide-y">{items.map((item) => <div className="flex items-center gap-3 py-3" key={item.id}><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">{item.type === "recharge" ? <WalletCards className="size-4" /> : item.type === "product" ? <Gift className="size-4" /> : <Ticket className="size-4" />}</div><div className="min-w-0 flex-1"><p className="font-medium">{labelFor(item.type)} · {detailFor(item)}</p><p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{item.code}</p></div><div className="text-right text-xs"><p className={item.status === "claimed" && !item.expired ? "font-medium" : "text-muted-foreground"}>{item.expired ? t("voucherExpired") : item.status === "claimed" ? t("voucherReady") : item.status === "reserved" ? t("voucherReserved") : t("voucherUsed")}</p>{item.expiresAt ? <p className="mt-0.5 text-muted-foreground">{t("validUntil", { date: new Date(item.expiresAt).toLocaleDateString(locale) })}</p> : null}</div></div>)}</div>}</CardContent></Card>
  </div>;
}

function Info({ icon: Icon, title, description }: { icon: typeof Ticket; title: string; description: string }) {
  return <div className="flex items-center gap-3 rounded-xl border bg-card p-4"><div className="flex size-9 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></div><div><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div></div>;
}
