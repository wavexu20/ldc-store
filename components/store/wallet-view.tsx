"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Coins, CreditCard, Gift, History, Landmark, Loader2, Sparkles, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { createRecharge, getWalletOverview } from "@/lib/actions/wallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/components/i18n-provider";

type WalletData = Extract<Awaited<ReturnType<typeof getWalletOverview>>, { success: true }>;
const rechargeOptions = [50, 100, 300, 500];

export function WalletView({ data }: { data: WalletData }) {
  const { locale, t } = useI18n();
  const [amount, setAmount] = useState("100.00");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const amountCents = Math.max(0, Math.round(Number(amount || 0) * 100));
  const availableCents = data.user.balanceCents + data.user.bonusBalanceCents;
  const bonusCents = Math.floor(amountCents / 100);

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

  return <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:py-10">
    <div className="flex flex-col gap-1"><h1 className="text-2xl font-semibold tracking-tight">余额与充值</h1><p className="text-sm text-muted-foreground">管理可用余额、充值赠送与会员积分</p></div>

    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="overflow-hidden border-indigo-100 bg-gradient-to-br from-indigo-50 via-background to-violet-50 shadow-sm dark:border-indigo-950 dark:from-indigo-950/30 dark:via-background dark:to-violet-950/20">
        <CardHeader className="relative pb-4"><div className="absolute right-0 top-0 size-36 -translate-y-10 translate-x-10 rounded-full bg-indigo-400/15 blur-2xl" /><CardDescription className="relative text-slate-600 dark:text-slate-300">可用余额</CardDescription><CardTitle className="relative text-5xl font-semibold tracking-tight text-slate-950 dark:text-white">¥{(availableCents / 100).toFixed(2)}</CardTitle><p className="relative mt-1 text-xs text-slate-500 dark:text-slate-400">会员编号 · {data.user.memberNo}</p></CardHeader>
        <CardContent className="relative grid grid-cols-2 gap-3"><div className="rounded-xl border border-indigo-100 bg-white/80 p-3 dark:border-indigo-900 dark:bg-background/60"><p className="text-xs text-slate-600 dark:text-slate-300">现金余额</p><p className="mt-1 text-lg font-medium text-slate-950 dark:text-white">¥{(data.user.balanceCents / 100).toFixed(2)}</p></div><div className="rounded-xl border border-indigo-100 bg-white/80 p-3 dark:border-indigo-900 dark:bg-background/60"><p className="text-xs text-slate-600 dark:text-slate-300">奖励金</p><p className="mt-1 text-lg font-medium text-slate-950 dark:text-white">¥{(data.user.bonusBalanceCents / 100).toFixed(2)}</p></div><div className="col-span-2 flex items-center justify-between border-t border-indigo-100 pt-4 text-sm dark:border-indigo-900"><span className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Coins className="size-4 text-amber-500" />会员积分</span><span className="font-semibold text-slate-950 dark:text-white">{data.user.pointsBalance}</span></div></CardContent>
      </Card>

      <Card className="border shadow-sm"><CardHeader className="pb-4"><CardTitle className="flex items-center gap-2 text-lg"><WalletCards className="size-5 text-primary" />充值余额</CardTitle><CardDescription>到账后可直接用于商城支付</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2"><Label htmlFor="amount">{t("topupAmount")}</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">¥</span><Input id="amount" className="h-12 pl-8 text-lg font-semibold tabular-nums" type="number" min="1" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></div><div className="grid grid-cols-4 gap-2">{rechargeOptions.map((value) => <Button className="cursor-pointer" key={value} type="button" variant={amountCents === value * 100 ? "default" : "outline"} size="sm" onClick={() => setAmount(value.toFixed(2))}>¥{value}</Button>)}</div><div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"><div className="rounded-lg bg-emerald-600/10 p-1.5"><Gift className="size-4 text-emerald-700 dark:text-emerald-300" /></div><span className="flex-1">本次充值赠送 1% 奖励金</span><strong>+¥{(bonusCents / 100).toFixed(2)}</strong></div><Button className="w-full cursor-pointer" size="lg" disabled={pending || amountCents < 100} onClick={recharge}>{pending ? <Loader2 className="animate-spin" /> : <CreditCard />}{t("topupNow")}</Button><p className="text-center text-xs text-muted-foreground">充值时将进行二次验证，保障账户资金安全</p></CardContent></Card>
    </div>

    <div className="grid gap-3 sm:grid-cols-2"><div className="flex gap-3 rounded-xl border bg-card p-4"><div className="rounded-lg bg-amber-500/10 p-2 text-amber-600"><Gift className="size-5" /></div><div><p className="font-medium">充值赠送</p><p className="mt-1 text-sm text-muted-foreground">每次充值额外获得 1% 奖励金。</p></div></div><div className="flex gap-3 rounded-xl border bg-card p-4"><div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600"><Sparkles className="size-5" /></div><div><p className="font-medium">积分抵扣</p><p className="mt-1 text-sm text-muted-foreground">实付 ¥1 获得 1 积分；200 积分抵 ¥1，单笔最高抵 10%。</p></div></div></div>

    <Card><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><History className="size-5" />账户动态</CardTitle><CardDescription className="mt-1">资金与会员权益的最近变动</CardDescription></div></CardHeader><CardContent><Tabs defaultValue="balance"><TabsList><TabsTrigger value="balance">余额明细</TabsTrigger><TabsTrigger value="benefits">会员权益</TabsTrigger></TabsList><TabsContent value="balance" className="mt-4 divide-y">{data.transactions.length === 0 ? <EmptyState icon={<Landmark className="size-5" />} label={t("noBalanceRecords")} /> : data.transactions.map((item) => { const positive = item.amountCents > 0; return <div key={item.id} className="flex items-center gap-3 py-3"><div className={`rounded-full p-2 ${positive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>{positive ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.description || item.type}</p><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale)}</p></div><div className="text-right"><p className={`font-semibold tabular-nums ${positive ? "text-emerald-600" : "text-rose-600"}`}>{positive ? "+" : ""}{(item.amountCents / 100).toFixed(2)}</p><p className="text-xs text-muted-foreground">{t("balanceAfter", { amount: (item.balanceAfterCents / 100).toFixed(2) })}</p></div></div>; })}</TabsContent><TabsContent value="benefits" className="mt-4 divide-y">{data.memberHistory.length === 0 ? <EmptyState icon={<Sparkles className="size-5" />} label="暂无会员权益记录" /> : data.memberHistory.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><div className={`rounded-full p-2 ${item.amount > 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>{item.asset === "points" ? <Coins className="size-4" /> : <Gift className="size-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.description || item.type}</p><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale)}</p></div><div className="text-right"><p className={item.amount > 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>{item.amount > 0 ? "+" : ""}{item.asset === "bonus" ? `¥${(item.amount / 100).toFixed(2)}` : item.amount}</p><p className="text-xs text-muted-foreground">余额 {item.asset === "bonus" ? `¥${(item.balanceAfter / 100).toFixed(2)}` : item.balanceAfter}</p></div></div>)}</TabsContent></Tabs></CardContent></Card>
  </div>;
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><div className="rounded-full bg-muted p-3">{icon}</div><p>{label}</p></div>;
}
