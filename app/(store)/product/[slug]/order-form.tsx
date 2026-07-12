"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Loader2, Minus, Plus, CheckCircle2, WalletCards } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { calculatePointsRedemption } from "@/lib/membership";

const orderFormSchema = z.object({
  quantity: z.number().int().min(1),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

interface OrderFormProps {
  productId: string;
  productName: string;
  price: number;
  stock: number;
  minQuantity: number;
  maxQuantity: number;
  membership?: { balanceCents: number; bonusBalanceCents: number; pointsBalance: number; discountVouchers: Array<{ id: string; code: string; discountAmountCents: number; minOrderCents: number; expiresAt: Date | null }> };
}

export function OrderForm({
  productId,
  productName,
  price,
  stock,
  minQuantity,
  maxQuantity,
  membership,
}: OrderFormProps) {
  const [isPending, startTransition] = useTransition();
  const { t } = useI18n();
  const [paymentMethod, setPaymentMethod] = useState<"gateway" | "balance">("gateway");
  const [usePoints, setUsePoints] = useState(false);
  const [selectedVoucherId, setSelectedVoucherId] = useState("");
  const router = useRouter();
  const { data: session, status } = useSession();
  const effectiveMax = Math.min(maxQuantity, stock);

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
  const totalPrice = (price * quantity).toFixed(2);
  const totalCents = Math.round(price * quantity * 100);
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

  const handleLogin = () => {
    router.push("/login");
  };

  const onSubmit = (values: OrderFormValues) => {
    if (!isLoggedIn) {
      toast.error(t("loginRequired"));
      return;
    }

    startTransition(async () => {
      const result = await createOrder({
        productId,
        quantity: values.quantity,
        paymentMethod,
        usePoints: paymentMethod === "balance" && usePoints,
        voucherId: voucherDiscountCents > 0 ? selectedVoucherId : undefined,
      });

      if (result.success) {
        toast.success(t("orderCreated"), {
          description: t("orderNumberValue", { number: result.orderNo || "" }),
        });

        // 保存订单号到 localStorage，用于支付完成后回调页面读取
        localStorage.setItem("ldc_last_order_no", result.orderNo!);

        if (result.paymentForm) {
          if (result.paymentForm.redirectUrl) {
            window.location.assign(result.paymentForm.redirectUrl);
            return;
          }
          if (!result.paymentForm.actionUrl || !result.paymentForm.params) {
            throw new Error(t("invalidPaymentLink"));
          }
          const form = document.createElement("form");
          form.method = "POST";
          form.action = result.paymentForm.actionUrl;
          form.style.display = "none";

          Object.entries(result.paymentForm.params).forEach(([key, value]) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = key;
            input.value = value;
            form.appendChild(input);
          });

          document.body.appendChild(form);
          form.submit();
        } else {
          router.push(`/order/result?out_trade_no=${result.orderNo}`);
        }
      } else {
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

  // 未登录提示
  if (!isLoggedIn) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900 dark:bg-amber-950">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {t("signInToBuy")}
          </p>
        </div>
        <Button onClick={handleLogin} className="w-full">
          {t("loginTitle")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {/* 登录用户提示 */}
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        <span>
          {t("signedInAs", { name: user?.name || user?.username || "" })}
        </span>
      </div>

      <div className="space-y-2">
        <Label>{t("paymentMethod")}</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={paymentMethod === "gateway" ? "default" : "outline"} onClick={() => setPaymentMethod("gateway")}>{t("onlinePayment")}</Button>
          <Button type="button" variant={paymentMethod === "balance" ? "default" : "outline"} onClick={() => setPaymentMethod("balance")}><WalletCards />{t("accountBalance")}</Button>
        </div>
      </div>

      {paymentMethod === "balance" && membership && <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <div className="flex justify-between"><span>现金余额</span><span>¥{(membership.balanceCents / 100).toFixed(2)}</span></div>
        <div className="mt-1 flex justify-between"><span>奖励金</span><span>¥{(membership.bonusBalanceCents / 100).toFixed(2)}</span></div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 border-t pt-3">
          <input className="h-4 w-4 accent-primary" type="checkbox" checked={usePoints} onChange={(event) => setUsePoints(event.target.checked)} disabled={membership.pointsBalance < 2} />
          <span className="flex-1">使用积分（现有 {membership.pointsBalance}）</span>
          {redemption.discountCents > 0 && <span className="text-emerald-600">-¥{(redemption.discountCents / 100).toFixed(2)}</span>}
        </label>
        <p className="mt-2 text-xs text-muted-foreground">200 积分抵 ¥1，单笔最多抵扣 10%</p>
      </div>}

      {membership && membership.discountVouchers.length > 0 && <div className="space-y-2 rounded-lg border bg-muted/20 p-3"><Label htmlFor="discount-voucher">满减券</Label><Select value={selectedVoucherId || "none"} onValueChange={(value) => setSelectedVoucherId(value === "none" ? "" : value)}><SelectTrigger id="discount-voucher"><SelectValue placeholder="不使用满减券" /></SelectTrigger><SelectContent><SelectItem value="none">不使用满减券</SelectItem>{membership.discountVouchers.map((voucher) => <SelectItem key={voucher.id} value={voucher.id}>满 ¥{(voucher.minOrderCents / 100).toFixed(2)} 减 ¥{(voucher.discountAmountCents / 100).toFixed(2)}</SelectItem>)}</SelectContent></Select>{selectedVoucher ? <p className={voucherDiscountCents > 0 ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{voucherDiscountCents > 0 ? `本单已减 ¥${(voucherDiscountCents / 100).toFixed(2)}` : `还差 ¥${((selectedVoucher.minOrderCents - totalCents) / 100).toFixed(2)} 可使用`}</p> : null}</div>}

      {/* Quantity */}
      <div className="space-y-2">
        <Label>{t("quantity")}</Label>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-md border">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => updateQuantity(-1)}
              disabled={quantity <= minQuantity}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              className="h-9 w-14 border-0 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              value={quantity}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= minQuantity && val <= effectiveMax) {
                  form.setValue("quantity", val);
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => updateQuantity(1)}
              disabled={quantity >= effectiveMax}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-sm text-muted-foreground">
            {t("purchaseLimit", { min: minQuantity, max: effectiveMax })}
          </span>
        </div>
      </div>

      {/* Total & Submit */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <span className="text-sm text-muted-foreground">{productName} × {quantity}</span>
          <div className="text-xl font-bold">¥{((afterVoucherCents - redemption.discountCents) / 100).toFixed(2)}</div>
          {voucherDiscountCents > 0 ? <p className="text-xs text-muted-foreground">已使用满减券 -¥{(voucherDiscountCents / 100).toFixed(2)}</p> : null}
        </div>
        <Button type="submit" disabled={isPending}>
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
    </form>
  );
}
