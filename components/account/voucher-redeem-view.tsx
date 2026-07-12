"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Gift, Loader2, Ticket, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { redeemVoucher } from "@/lib/actions/vouchers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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

function labelFor(type: VoucherItem["type"]) {
  return type === "recharge" ? "充值券" : type === "product" ? "商品兑换券" : "满减券";
}

function detailFor(item: VoucherItem) {
  if (item.type === "recharge") return `到账 ¥${(item.rechargeAmountCents / 100).toFixed(2)}`;
  if (item.type === "product") return item.productName || "指定商品";
  return `满 ¥${(item.minOrderCents / 100).toFixed(2)} 减 ¥${(item.discountAmountCents / 100).toFixed(2)}`;
}

export function VoucherRedeemView({ items }: { items: VoucherItem[] }) {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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
    <div><h1 className="text-2xl font-semibold tracking-tight">卡券兑换</h1><p className="mt-1 text-sm text-muted-foreground">输入从合作平台购买的卡券码，兑换到账户或商品。</p></div>
    <Card className="border shadow-sm"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Ticket className="size-5" /></div><Input aria-label="卡券码" className="h-11 font-mono uppercase tracking-[0.08em]" placeholder="G3D-XXXX-XXXX-XXXX-XXXX" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") redeem(); }} /><Button className="h-11 shrink-0" disabled={pending || !code.trim()} onClick={redeem}>{pending ? <Loader2 className="animate-spin" /> : <Ticket />}立即兑换</Button></CardContent></Card>

    <div className="grid gap-3 sm:grid-cols-3"><Info icon={WalletCards} title="充值券" description="兑换后直接到账" /><Info icon={Gift} title="商品兑换券" description="直接兑换指定商品" /><Info icon={Ticket} title="满减券" description="存入账号，结算时使用" /></div>

    <Card><CardHeader><CardTitle className="text-lg">我的卡券</CardTitle><CardDescription>已兑换的卡券与使用状态。</CardDescription></CardHeader><CardContent>{items.length === 0 ? <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><Ticket className="size-5" />暂无已兑换卡券</div> : <div className="divide-y">{items.map((item) => <div className="flex items-center gap-3 py-3" key={item.id}><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">{item.type === "recharge" ? <WalletCards className="size-4" /> : item.type === "product" ? <Gift className="size-4" /> : <Ticket className="size-4" />}</div><div className="min-w-0 flex-1"><p className="font-medium">{labelFor(item.type)} · {detailFor(item)}</p><p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{item.code}</p></div><div className="text-right text-xs"><p className={item.status === "claimed" && !item.expired ? "font-medium" : "text-muted-foreground"}>{item.expired ? "已过期" : item.status === "claimed" ? "待使用" : item.status === "reserved" ? "订单处理中" : "已使用"}</p>{item.expiresAt ? <p className="mt-0.5 text-muted-foreground">有效至 {new Date(item.expiresAt).toLocaleDateString()}</p> : null}</div></div>)}</div>}</CardContent></Card>
  </div>;
}

function Info({ icon: Icon, title, description }: { icon: typeof Ticket; title: string; description: string }) {
  return <div className="flex items-center gap-3 rounded-xl border bg-card p-4"><div className="flex size-9 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></div><div><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div></div>;
}
