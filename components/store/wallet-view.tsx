"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Coins, CreditCard, ExternalLink, Gift, History, Landmark, Loader2, Sparkles, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { createRecharge, getWalletOverview } from "@/lib/actions/wallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/components/i18n-provider";
import type { MembershipTier } from "@/lib/membership";
import { MembershipTierBadge } from "@/components/icons/membership-tier-badge";

type WalletData = Extract<Awaited<ReturnType<typeof getWalletOverview>>, { success: true }>;
const rechargeOptions = [50, 100, 300, 500];
const tierVisuals: Record<MembershipTier["key"], { card: string; iconWrap: string; progress: string; track: string; detail: string }> = {
  starter: { card: "border border-[#9c7656] bg-[linear-gradient(135deg,#171513_0%,#342920_42%,#6c5644_100%)] text-stone-50 shadow-[inset_0_1px_0_rgba(255,236,210,.12)]", iconWrap: "bg-black/30 ring-1 ring-[#e2b27d]/65", progress: "bg-[linear-gradient(90deg,#9a663c_0%,#f1c18a_48%,#b57642_100%)] shadow-[0_0_12px_rgba(225,169,105,.7)]", track: "bg-black/55 ring-1 ring-[#d4a272]/35", detail: "text-stone-200" },
  silver: { card: "border border-slate-300 bg-[linear-gradient(135deg,#f8fafc_0%,#cbd5e1_52%,#f8fafc_100%)] text-slate-900 dark:border-slate-600 dark:bg-[linear-gradient(135deg,#334155_0%,#64748b_52%,#334155_100%)] dark:text-white", iconWrap: "bg-white/55 shadow-sm dark:bg-white/10", progress: "bg-slate-600 dark:bg-slate-100", track: "bg-black/10 dark:bg-white/15", detail: "text-slate-600 dark:text-slate-200" },
  gold: { card: "border border-amber-300 bg-[linear-gradient(135deg,#fffbeb_0%,#fcd34d_52%,#fef3c7_100%)] text-amber-950 dark:border-amber-700 dark:bg-[linear-gradient(135deg,#78350f_0%,#b45309_52%,#78350f_100%)] dark:text-amber-50", iconWrap: "bg-white/45 shadow-sm dark:bg-white/10", progress: "bg-amber-700 dark:bg-amber-200", track: "bg-amber-950/10 dark:bg-white/15", detail: "text-amber-900/75 dark:text-amber-100/80" },
  obsidian: { card: "border border-zinc-700 bg-[radial-gradient(circle_at_88%_12%,#3f3f46_0%,#18181b_38%,#09090b_100%)] text-white", iconWrap: "bg-white/10 ring-1 ring-white/20", progress: "bg-white", track: "bg-white/15", detail: "text-zinc-300" },
};

export function WalletView({ data }: { data: WalletData }) {
  const { locale, t } = useI18n();
  const [amount, setAmount] = useState("100.00");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const amountCents = Math.max(0, Math.round(Number(amount || 0) * 100));
  const availableCents = data.user.balanceCents + data.user.bonusBalanceCents;
  const bonusCents = Math.floor(amountCents / 100);
  const membership = data.membership;
  const tierVisual = tierVisuals[membership.tier.key];
  const membershipProgressWidth = membership.nextTier ? Math.max(3, Math.round(membership.progress)) : 100;
  const externalStores = [
    { label: "闲鱼", href: data.externalStoreLinks.xianyu, logo: "/brands/xianyu.png" },
    { label: "链动小铺", href: data.externalStoreLinks.liandong, logo: "/brands/liandong.png" },
    { label: "Plati", href: data.externalStoreLinks.plati, logo: "/brands/plati.png" },
  ].filter((store) => Boolean(store.href));

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
      <Card className="overflow-hidden border-brand/15 bg-gradient-to-br from-brand/10 via-background to-brand/5 shadow-sm">
        <CardHeader className="relative pb-4"><div className="absolute right-0 top-0 size-36 -translate-y-10 translate-x-10 rounded-full bg-brand/15 blur-2xl" /><CardDescription className="relative text-muted-foreground">可用余额</CardDescription><CardTitle className="relative text-5xl font-semibold tracking-tight">¥{(availableCents / 100).toFixed(2)}</CardTitle><p className="relative mt-1 text-xs text-muted-foreground">会员编号 · {data.user.memberNo}</p></CardHeader>
        <CardContent className="relative grid grid-cols-2 gap-3"><div className="rounded-xl border border-brand/15 bg-card/80 p-3"><p className="text-xs text-muted-foreground">现金余额</p><p className="mt-1 text-lg font-medium">¥{(data.user.balanceCents / 100).toFixed(2)}</p></div><div className="rounded-xl border border-brand/15 bg-card/80 p-3"><p className="text-xs text-muted-foreground">奖励金</p><p className="mt-1 text-lg font-medium">¥{(data.user.bonusBalanceCents / 100).toFixed(2)}</p></div><div className="col-span-2 flex items-center justify-between border-t border-brand/15 pt-4 text-sm"><span className="flex items-center gap-2 text-muted-foreground"><Coins className="size-4 text-warning" />会员积分</span><span className="font-semibold">{data.user.pointsBalance}</span></div><div className={`relative col-span-2 mt-1 overflow-hidden rounded-2xl p-4 shadow-sm ${tierVisual.card}`}><div className="absolute -right-10 -top-12 size-40 rounded-full border border-current/10" /><div className="absolute -bottom-16 right-16 size-36 rounded-full border border-current/10" /><div className="relative"><div className="flex items-start justify-between gap-3"><div className={`flex size-11 items-center justify-center rounded-xl p-1.5 ${tierVisual.iconWrap}`}><MembershipTierBadge tier={membership.tier.key} className="size-8" /></div><span className={`text-[10px] font-semibold tracking-[0.2em] ${tierVisual.detail}`}>G3D MEMBER</span></div><div className="mt-5 flex items-end justify-between gap-3"><div><p className="text-xl font-semibold tracking-tight">{membership.tier.name}</p><p className={`mt-1 text-xs ${tierVisual.detail}`}>累计有效消费 ¥{(membership.totalSpentCents / 100).toFixed(2)}</p></div><p className={`font-mono text-xs ${tierVisual.detail}`}>{data.user.memberNo}</p></div><div className="mt-4"><div className={`mb-1.5 flex justify-between text-xs ${tierVisual.detail}`}><span>{membership.nextTier ? `距 ${membership.nextTier.name}` : "最高等级"}</span><span>{membership.nextTier ? `还差 ¥${(membership.amountToNextCents / 100).toFixed(2)}` : "已解锁"}</span></div><div className={`h-2 overflow-hidden rounded-full ${tierVisual.track}`} role="progressbar" aria-label="会员等级进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(membership.progress)}><div className={`h-full rounded-full transition-[width] duration-300 ${tierVisual.progress}`} style={{ width: `${membershipProgressWidth}%` }} /></div></div></div></div></CardContent>
      </Card>

      <Card className="border shadow-sm"><CardHeader className="pb-4"><CardTitle className="flex items-center gap-2 text-lg"><WalletCards className="size-5 text-brand" />充值余额</CardTitle><CardDescription>到账后可直接用于商城支付</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2"><Label htmlFor="amount">{t("topupAmount")}</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">¥</span><Input id="amount" className="h-12 pl-8 text-lg font-semibold tabular-nums" type="number" min="1" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></div><div className="grid grid-cols-4 gap-2">{rechargeOptions.map((value) => <Button className="cursor-pointer" key={value} type="button" variant={amountCents === value * 100 ? "default" : "outline"} size="sm" onClick={() => setAmount(value.toFixed(2))}>¥{value}</Button>)}</div><div className="flex items-center gap-3 rounded-xl bg-success/10 px-3 py-2.5 text-sm text-success dark:text-success"><div className="rounded-lg bg-success/10 p-1.5"><Gift className="size-4" /></div><span className="flex-1">本次充值赠送 1% 奖励金</span><strong>+¥{(bonusCents / 100).toFixed(2)}</strong></div><Button className="w-full cursor-pointer" size="lg" disabled={pending || amountCents < 100} onClick={recharge}>{pending ? <Loader2 className="animate-spin" /> : <CreditCard />}{t("topupNow")}</Button><p className="text-center text-xs text-muted-foreground">支付完成后余额将自动到账</p>{externalStores.length > 0 ? <div className="border-t pt-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-medium">第三方平台购买</p><p className="mt-0.5 text-xs text-muted-foreground">购买卡券后，在“卡券兑换”中充值到账。</p></div></div><div className="grid grid-cols-3 gap-2">{externalStores.map((store) => <Button asChild className="text-xs" key={store.label} size="sm" variant="outline"><a aria-label={store.label} href={store.href} target="_blank" rel="noreferrer">{store.logo ? <><Image src={store.logo} alt={store.label} width={124} height={32} className="h-5 w-auto max-w-[92px] object-contain" /><span className="sr-only">{store.label}</span></> : store.label}<ExternalLink className="size-3 shrink-0" /></a></Button>)}</div></div> : null}</CardContent></Card>
    </div>

    <div className="grid gap-3 sm:grid-cols-2"><div className="flex items-center gap-3 rounded-xl border bg-card p-4"><div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning"><Gift className="size-5" /></div><div><p className="font-medium">充值赠送</p><p className="mt-1 text-sm text-muted-foreground">每次充值额外获得 1% 奖励金。</p></div></div><div className="flex items-center gap-3 rounded-xl border bg-card p-4"><div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"><Sparkles className="size-5" /></div><div><p className="font-medium">积分抵扣</p><p className="mt-1 text-sm text-muted-foreground">实付 ¥1 获得 1 积分；200 积分抵 ¥1，单笔最高抵 10%。</p></div></div></div>

    <Card><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><History className="size-5" />账户动态</CardTitle><CardDescription className="mt-1">资金与会员权益的最近变动</CardDescription></div></CardHeader><CardContent><Tabs defaultValue="balance"><TabsList><TabsTrigger value="balance">余额明细</TabsTrigger><TabsTrigger value="benefits">会员权益</TabsTrigger></TabsList><TabsContent value="balance" className="mt-4 divide-y">{data.transactions.length === 0 ? <EmptyState icon={<Landmark className="size-5" />} label={t("noBalanceRecords")} /> : data.transactions.map((item) => { const positive = item.amountCents > 0; return <div key={item.id} className="flex items-center gap-3 py-3"><div className={`rounded-full p-2 ${positive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>{positive ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.description || item.type}</p><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale)}</p></div><div className="text-right"><p className={`font-semibold tabular-nums ${positive ? "text-emerald-600" : "text-rose-600"}`}>{positive ? "+" : ""}{(item.amountCents / 100).toFixed(2)}</p><p className="text-xs text-muted-foreground">{t("balanceAfter", { amount: (item.balanceAfterCents / 100).toFixed(2) })}</p></div></div>; })}</TabsContent><TabsContent value="benefits" className="mt-4 divide-y">{data.memberHistory.length === 0 ? <EmptyState icon={<Sparkles className="size-5" />} label="暂无会员权益记录" /> : data.memberHistory.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><div className={`rounded-full p-2 ${item.amount > 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>{item.asset === "points" ? <Coins className="size-4" /> : <Gift className="size-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.description || item.type}</p><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale)}</p></div><div className="text-right"><p className={item.amount > 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>{item.amount > 0 ? "+" : ""}{item.asset === "bonus" ? `¥${(item.amount / 100).toFixed(2)}` : item.amount}</p><p className="text-xs text-muted-foreground">余额 {item.asset === "bonus" ? `¥${(item.balanceAfter / 100).toFixed(2)}` : item.balanceAfter}</p></div></div>)}</TabsContent></Tabs></CardContent></Card>
  </div>;
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><div className="rounded-full bg-muted p-3">{icon}</div><p>{label}</p></div>;
}
