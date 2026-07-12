"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { verifyLoginTwoFactor } from "@/lib/actions/security";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TwoFactorChallenge({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const [value, setValue] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(30);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const safeCallback = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
  useEffect(() => {
    const updateRemainingSeconds = () => {
      setRemainingSeconds(Math.max(1, 30 - Math.floor((Date.now() % 30_000) / 1_000)));
    };
    updateRemainingSeconds();
    const interval = window.setInterval(updateRemainingSeconds, 250);
    return () => window.clearInterval(interval);
  }, []);
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
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4"><Card className="w-full max-w-md shadow-lg"><CardHeader className="text-center"><div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ShieldCheck className="size-5" /></div><CardTitle>二次验证</CardTitle><CardDescription>输入验证器验证码或恢复码以继续。</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={verify}><div className="space-y-2"><Label htmlFor="login-2fa-code">验证码或恢复码</Label><Input id="login-2fa-code" autoFocus placeholder="000000 或 ABCD-E" value={value} onChange={(event) => setValue(event.target.value)} /></div><p className="text-center text-xs text-muted-foreground" aria-live="polite">本周期剩余 {remainingSeconds} 秒{remainingSeconds <= 5 ? "，建议等待下一组验证码后再提交。" : "。"}</p><Button className="w-full" disabled={pending || !value} type="submit">{pending ? <Loader2 className="animate-spin" /> : <KeyRound />}验证并继续</Button></form></CardContent></Card></main>;
}
