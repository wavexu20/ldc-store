"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { verifyLoginTwoFactor } from "@/lib/actions/security";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n-provider";

export function TwoFactorChallenge({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const safeCallback = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
  function verify(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await verifyLoginTwoFactor(value);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.replace(safeCallback);
      router.refresh();
    });
  }
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4"><Card className="w-full max-w-md shadow-lg"><CardHeader className="text-center"><div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ShieldCheck className="size-5" /></div><CardTitle>{t("verifyTwoFactorTitle")}</CardTitle><CardDescription>{t("verifyTwoFactorDescription")}</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={verify}><div className="space-y-2"><Label htmlFor="login-2fa-code">{t("twoFactorCodeOrRecovery")}</Label><Input id="login-2fa-code" autoFocus placeholder="000000 / ABCD-E" value={value} onChange={(event) => setValue(event.target.value)} /></div><Button className="w-full" disabled={pending || !value} type="submit">{pending ? <Loader2 className="animate-spin" /> : <KeyRound />}{t("verifyAndContinue")}</Button></form></CardContent></Card></main>;
}
