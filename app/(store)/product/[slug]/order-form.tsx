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
import { toast } from "sonner";
import { Loader2, Minus, Plus, CheckCircle2, WalletCards } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

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
}

export function OrderForm({
  productId,
  productName,
  price,
  stock,
  minQuantity,
  maxQuantity,
}: OrderFormProps) {
  const [isPending, startTransition] = useTransition();
  const { t } = useI18n();
  const [paymentMethod, setPaymentMethod] = useState<"gateway" | "balance">("gateway");
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
          <div className="text-xl font-bold">¥{totalPrice}</div>
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
