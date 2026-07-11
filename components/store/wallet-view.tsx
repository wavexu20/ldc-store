"use client";

import { useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, Loader2, WalletCards } from "lucide-react";
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

  function recharge() {
    const amountCents = Math.round(Number(amount) * 100);
    startTransition(async () => {
      const result = await createRecharge(amountCents);
      if (!result.success || !result.paymentForm) {
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
        <CardHeader><CardDescription className="text-white/70">{t("availableBalance")}</CardDescription><CardTitle className="text-4xl">¥{(data.user.balanceCents / 100).toFixed(2)}</CardTitle></CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="flex-1 space-y-2"><Label htmlFor="amount">{t("topupAmount")}</Label><Input id="amount" className="bg-white text-slate-950" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <Button variant="secondary" disabled={pending} onClick={recharge}>{pending ? <Loader2 className="animate-spin" /> : <WalletCards />}{t("topupNow")}</Button>
        </CardContent>
      </Card>

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
    </div>
  );
}
