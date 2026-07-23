"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSession } from "next-auth/react";
import { createOrder } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight, Loader2, Minus, Plus, CheckCircle2, CreditCard, WalletCards } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { calculatePointsRedemption } from "@/lib/membership";
import { CnySettlementHint, Money } from "@/components/store/money";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { guestOrderStorageKey } from "@/lib/order-access";
import { launchPayment } from "@/lib/payment/launch-client";

const orderFormSchema = z.object({
  quantity: z.number().int().min(1),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

interface OrderFormProps {
  productId: string;
  price: number;
  stock: number;
  minQuantity: number;
  maxQuantity: number;
  variants?: Array<{ id: string; name: string; price: string; originalPrice: string | null; stock: number }>;
  membership?: { balanceCents: number; bonusBalanceCents: number; pointsBalance: number; discountVouchers: Array<{ id: string; code: string; discountAmountCents: number; minOrderCents: number; expiresAt: Date | null }> };
  inventoryManaged?: boolean;
  turnstileSiteKey?: string;
  initialVariantId?: string;
}

export function OrderForm({
  productId,
  price,
  stock,
  minQuantity,
  maxQuantity,
  variants = [],
  membership,
  inventoryManaged = true,
  turnstileSiteKey = "",
  initialVariantId = "",
}: OrderFormProps) {
  const [isPending, startTransition] = useTransition();
  const { t } = useI18n();
  const [paymentMethod, setPaymentMethod] = useState<"gateway" | "balance">("gateway");
  const [usePoints, setUsePoints] = useState(false);
  const [selectedVoucherId, setSelectedVoucherId] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState(
    () => initialVariantId || variants.find((variant) => !inventoryManaged || variant.stock >= minQuantity)?.id || variants[0]?.id || ""
  );
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const selectedVariant = variants.length > 0
      ? variants.find((variant) => variant.id === selectedVariantId)
      ?? variants.find((variant) => !inventoryManaged || variant.stock >= minQuantity)
      ?? variants[0]
    : null;
  const activePrice = selectedVariant ? Number(selectedVariant.price) : price;
  const activeStock = inventoryManaged ? (selectedVariant ? selectedVariant.stock : stock) : maxQuantity;
  const effectiveMax = Math.min(maxQuantity, activeStock);

  // 检查是否是 Linux DO 登录用户
  const user = session?.user as { id?: string; username?: string; name?: string } | undefined;
  const isLoggedIn = Boolean(user?.id);

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      quantity: minQuantity,
    },
  });

  const quantity = form.watch("quantity");
  const totalCents = Math.round(activePrice * quantity * 100);
  const selectedVoucher = membership?.discountVouchers.find((voucher) => voucher.id === selectedVoucherId);
  const voucherDiscountCents = selectedVoucher && totalCents >= selectedVoucher.minOrderCents ? Math.min(totalCents, selectedVoucher.discountAmountCents) : 0;
  const afterVoucherCents = totalCents - voucherDiscountCents;
  const redemption = usePoints ? calculatePointsRedemption(afterVoucherCents, membership?.pointsBalance || 0) : { points: 0, discountCents: 0 };

  const updateQuantity = (delta: number) => {
    const newValue = quantity + delta;
    if (newValue >= minQuantity && newValue <= effectiveMax) {
      form.setValue("quantity", newValue);
    }
  };

  const onSubmit = (values: OrderFormValues) => {
    if (!isLoggedIn && (!guestEmail.trim() || !turnstileToken)) {
      toast.error("填写接收订单通知的邮箱并完成人机验证后即可购买");
      return;
    }

    startTransition(async () => {
      const result = await createOrder({
        productId,
        variantId: selectedVariant?.id || undefined,
        quantity: values.quantity,
        paymentMethod,
        usePoints: paymentMethod === "balance" && usePoints,
        voucherId: voucherDiscountCents > 0 ? selectedVoucherId : undefined,
        email: isLoggedIn ? undefined : guestEmail.trim(),
        turnstileToken: isLoggedIn ? undefined : turnstileToken || undefined,
      });

      if (result.success) {
        toast.success(t("orderCreated"), {
          description: t("orderNumberValue", { number: result.orderNo || "" }),
        });

        // 保存订单号到 localStorage，用于支付完成后回调页面读取
        localStorage.setItem("g3d_last_order_no", result.orderNo!);
        if (result.guestAccessToken && result.orderNo) {
          localStorage.setItem(guestOrderStorageKey(result.orderNo), result.guestAccessToken);
        }

        if (result.paymentForm) {
          launchPayment(result.paymentForm);
        } else {
          router.push(`/order/result?out_trade_no=${result.orderNo}`);
        }
      } else {
        if (!isLoggedIn) {
          setTurnstileToken(null);
          setTurnstileKey((value) => value + 1);
        }
        if (result.requiresSecondFactor) {
          router.push(`/account/verify-2fa?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        toast.error(t("orderFailed"), {
          description: result.message,
        });
      }
    });
  };

  // 加载中
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      {isLoggedIn ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{t("signedInAs", { name: user?.name || user?.username || "" })}</span>
        </div>
      ) : (
        <div className="space-y-2.5 rounded-xl border bg-muted/15 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="guest-order-email">{t("guestOrderEmail")}</Label>
            <Link
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-success underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={`/login?mode=register&callbackUrl=${encodeURIComponent(pathname)}`}
            >
              {t("memberRechargeBenefitShort")}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <Input id="guest-order-email" className="h-10" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} required />
          {turnstileSiteKey ? (
            <>
              <div className={turnstileToken ? "hidden" : undefined}>
                <TurnstileWidget key={turnstileKey} siteKey={turnstileSiteKey} action="guest_checkout" onVerify={setTurnstileToken} />
              </div>
              {turnstileToken ? (
                <div className="flex h-10 items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 text-xs font-medium text-success">
                  <CheckCircle2 className="size-4" />
                  {t("securityVerified")}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-destructive">{t("checkoutCaptchaUnavailable")}</p>
          )}
          <p className="text-[11px] leading-5 text-muted-foreground">{t("checkoutAgreement")} <Link href="/terms" className="underline underline-offset-4">{t("footerTerms")}</Link> · <Link href="/privacy" className="underline underline-offset-4">{t("footerPrivacy")}</Link> · <Link href="/refund-policy" className="underline underline-offset-4">{t("footerRefunds")}</Link>.</p>
        </div>
      )}

      {variants.length > 0 ? <div className="space-y-2"><Label>{t("selectVariant")}</Label><div className="flex flex-wrap gap-2">{variants.map((variant) => { const selected = selectedVariant?.id === variant.id; const unavailable = inventoryManaged && variant.stock < minQuantity; return <Button key={variant.id} type="button" size="sm" variant={selected ? "default" : "outline"} disabled={unavailable} onClick={() => { setSelectedVariantId(variant.id); form.setValue("quantity", minQuantity); }}>{variant.name}<Money amount={variant.price} className="ml-1" />{unavailable ? <span className="ml-1 text-xs opacity-70">{t("variantOutOfStock")}</span> : null}</Button>; })}</div>{selectedVariant ? <p className="text-xs text-muted-foreground">{t("selectedVariant", { name: selectedVariant.name })}{inventoryManaged ? ` · ${t("availableUnits", { count: selectedVariant.stock })}` : ""}</p> : null}</div> : null}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {isLoggedIn ? <div className="flex flex-wrap items-center gap-2.5 border-b bg-muted/20 px-3.5 py-2.5">
          <Label className="shrink-0">{t("paymentMethod")}</Label>
          <div role="group" aria-label={t("paymentMethod")} className="inline-flex min-w-0 items-center rounded-lg border bg-background p-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={paymentMethod === "gateway"}
              className={paymentMethod === "gateway" ? "h-8 cursor-pointer bg-foreground px-3 text-background shadow-sm hover:bg-foreground/90 hover:text-background" : "h-8 cursor-pointer px-3 text-muted-foreground hover:text-foreground"}
              onClick={() => setPaymentMethod("gateway")}
            >
              <CreditCard className="size-4" />
              {t("onlinePayment")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={paymentMethod === "balance"}
              className={paymentMethod === "balance" ? "h-8 cursor-pointer bg-foreground px-3 text-background shadow-sm hover:bg-foreground/90 hover:text-background" : "h-8 cursor-pointer px-3 text-muted-foreground hover:text-foreground"}
              onClick={() => setPaymentMethod("balance")}
            >
              <WalletCards className="size-4" />
              {t("accountBalance")}
            </Button>
          </div>
        </div> : null}

        {paymentMethod === "balance" && membership ? <div className="border-b bg-muted/10 p-3 text-sm">
          <div className="flex justify-between"><span>现金余额</span><Money amount={membership.balanceCents} cents /></div>
          <div className="mt-1 flex justify-between"><span>奖励金</span><Money amount={membership.bonusBalanceCents} cents /></div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 border-t pt-3">
            <input className="h-4 w-4 accent-primary" type="checkbox" checked={usePoints} onChange={(event) => setUsePoints(event.target.checked)} disabled={membership.pointsBalance < 2} />
            <span className="flex-1">使用积分（现有 {membership.pointsBalance}）</span>
            {redemption.discountCents > 0 ? <Money amount={-redemption.discountCents} cents className="text-emerald-600" /> : null}
          </label>
          <p className="mt-2 text-xs text-muted-foreground">200 积分抵 ¥1，单笔最多抵扣 10%</p>
        </div> : null}

        {membership && membership.discountVouchers.length > 0 ? <div className="space-y-2 border-b bg-muted/10 p-3">
          <Label htmlFor="discount-voucher">满减券</Label>
          <Select value={selectedVoucherId || "none"} onValueChange={(value) => setSelectedVoucherId(value === "none" ? "" : value)}>
            <SelectTrigger id="discount-voucher"><SelectValue placeholder="不使用满减券" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不使用满减券</SelectItem>
              {membership.discountVouchers.map((voucher) => <SelectItem key={voucher.id} value={voucher.id}>满 ¥{(voucher.minOrderCents / 100).toFixed(2)} 减 ¥{(voucher.discountAmountCents / 100).toFixed(2)}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectedVoucher ? <p className={voucherDiscountCents > 0 ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{voucherDiscountCents > 0 ? `本单已减 ¥${(voucherDiscountCents / 100).toFixed(2)}` : `还差 ¥${((selectedVoucher.minOrderCents - totalCents) / 100).toFixed(2)} 可使用`}</p> : null}
        </div> : null}

        <div className="grid grid-cols-2 items-end gap-3 p-3.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="order-quantity">{t("quantity")}</Label>
              <span className="text-[11px] text-muted-foreground">{minQuantity}–{effectiveMax}</span>
            </div>
            <div className="flex w-fit items-center rounded-lg border bg-background shadow-xs">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 cursor-pointer rounded-r-none"
                aria-label={`${t("quantity")} -`}
                onClick={() => updateQuantity(-1)}
                disabled={quantity <= minQuantity}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="order-quantity"
                type="number"
                inputMode="numeric"
                className="h-10 w-14 rounded-none border-y-0 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={quantity}
                onChange={(event) => {
                  const value = parseInt(event.target.value);
                  if (!Number.isNaN(value) && value >= minQuantity && value <= effectiveMax) {
                    form.setValue("quantity", value);
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 cursor-pointer rounded-l-none"
                aria-label={`${t("quantity")} +`}
                onClick={() => updateQuantity(1)}
                disabled={quantity >= effectiveMax}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="min-w-0 sm:border-l sm:pl-5">
            <span className="text-xs text-muted-foreground">{t("total")}{selectedVariant ? ` · ${selectedVariant.name}` : ""}</span>
            <Money amount={afterVoucherCents - redemption.discountCents} cents className="mt-0.5 block text-xl font-bold" />
            <CnySettlementHint amount={(afterVoucherCents - redemption.discountCents) / 100} className="block" />
            {voucherDiscountCents > 0 ? <p className="text-xs text-muted-foreground">已使用满减券 -¥{(voucherDiscountCents / 100).toFixed(2)}</p> : null}
          </div>

          <Button
            className="col-span-2 mr-16 h-11 cursor-pointer justify-self-stretch px-5 shadow-sm sm:col-span-1 sm:min-w-32 sm:justify-self-end lg:mr-0"
            type="submit"
            disabled={isPending || effectiveMax < minQuantity || (!isLoggedIn && (!turnstileSiteKey || !turnstileToken || !guestEmail.trim()))}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("processing")}
              </>
            ) : (
              t("buyNow")
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
