"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Coins, Gift, Loader2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { createRecharge, getWalletOverview } from "@/lib/actions/wallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n-provider";

type WalletData = Extract<Awaited<ReturnType<typeof getWalletOverview>>, { success: true }>;

export function WalletView({ data }: { data: WalletData }) {
  const { locale, t } = useI18n();
  const [amount, setAmount] = useState("10.00");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const amountCents = Math.max(0, Math.round(Number(amount || 0) * 100));

  function recharge() {
    startTransition(async () => {
      const result = await createRecharge(amountCents);
      if (!result.success || !result.paymentForm) {
        if (result.requiresSecondFactor) {
          router.push("/account/verify-2fa?callbackUrl=%2Faccount%2Fwallet");
          return;
        }
        toast.error(result.message);
        return;
      }
      if (result.paymentForm.redirectUrl) {
        window.location.assign(result.paymentForm.redirectUrl);
        return;
      }
      if (!result.paymentForm.actionUrl || !result.paymentForm.params) {
        toast.error(t("invalidPaymentLink"));
        return;
      }
      const form = document.createElement("form");
      form.method = "POST";
      form.action = result.paymentForm.actionUrl;
      for (const [key, value] of Object.entries(result.paymentForm.params)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-xl">
        <CardHeader><CardDescription className="text-white/70">会员 {data.user.memberNo}</CardDescription><CardTitle className="text-4xl">¥{((data.user.balanceCents + data.user.bonusBalanceCents) / 100).toFixed(2)}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 pb-5 text-sm">
          <div className="rounded-lg bg-white/10 p-3"><p className="text-white/70">现金余额</p><p className="mt-1 font-semibold">¥{(data.user.balanceCents / 100).toFixed(2)}</p></div>
          <div className="rounded-lg bg-white/10 p-3"><p className="text-white/70">奖励金</p><p className="mt-1 font-semibold">¥{(data.user.bonusBalanceCents / 100).toFixed(2)}</p></div>
          <div className="rounded-lg bg-white/10 p-3"><p className="text-white/70">会员积分</p><p className="mt-1 font-semibold">{data.user.pointsBalance}</p></div>
        </CardContent>
        <CardContent className="flex items-end gap-3">
          <div className="flex-1 space-y-2"><Label htmlFor="amount">{t("topupAmount")}</Label><Input id="amount" className="bg-white text-slate-950" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <Button variant="secondary" disabled={pending} onClick={recharge}>{pending ? <Loader2 className="animate-spin" /> : <WalletCards />}{t("topupNow")}</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Gift className="h-4 w-4" />充值赠送</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">+¥{(Math.floor(amountCents / 100) / 100).toFixed(2)}</p><p className="mt-1 text-sm text-muted-foreground">每次充值额外赠送 1% 奖励金</p></CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Coins className="h-4 w-4" />积分规则</CardTitle></CardHeader><CardContent><p className="text-sm">实付 ¥1 获得 1 积分</p><p className="mt-1 text-sm text-muted-foreground">200 积分抵 ¥1，单笔最高抵 10%</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("balanceHistory")}</CardTitle><CardDescription>{t("balanceHistoryDescription")}</CardDescription></CardHeader>
        <CardContent className="divide-y">
          {data.transactions.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("noBalanceRecords")}</p> : data.transactions.map((item) => {
            const positive = item.amountCents > 0;
            return <div key={item.id} className="flex items-center gap-3 py-3">
              <div className={`rounded-full p-2 ${positive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>{positive ? <ArrowDownLeft /> : <ArrowUpRight />}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.description || item.type}</p><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale)}</p></div>
              <div className="text-right"><p className={`font-semibold ${positive ? "text-emerald-600" : "text-rose-600"}`}>{positive ? "+" : ""}{(item.amountCents / 100).toFixed(2)}</p><p className="text-xs text-muted-foreground">{t("balanceAfter", { amount: (item.balanceAfterCents / 100).toFixed(2) })}</p></div>
            </div>;
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>会员权益明细</CardTitle><CardDescription>奖励金与积分的最近变动</CardDescription></CardHeader>
        <CardContent className="divide-y">
          {data.memberHistory.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">暂无会员权益记录</p> : data.memberHistory.map((item) => <div key={item.id} className="flex items-center gap-3 py-3">
            <div className={`rounded-full p-2 ${item.amount > 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>{item.asset === "points" ? <Coins /> : <Gift />}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.description || item.type}</p><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale)}</p></div>
            <div className="text-right"><p className={item.amount > 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>{item.amount > 0 ? "+" : ""}{item.asset === "bonus" ? `¥${(item.amount / 100).toFixed(2)}` : item.amount}</p><p className="text-xs text-muted-foreground">余额 {item.asset === "bonus" ? `¥${(item.balanceAfter / 100).toFixed(2)}` : item.balanceAfter}</p></div>
          </div>)}
        </CardContent>
      </Card>
    </div>
  );
}
