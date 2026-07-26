"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { sendBindingEmail, verifyBindingEmail } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n-provider";

export function EmailBindingForm({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { update } = useSession();
  const safeCallback = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";

  function send() {
    startTransition(async () => {
      const result = await sendBindingEmail(email);
      if (!result.success) {
        if (result.requiresSecondFactor) {
          router.push(`/account/verify-2fa?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        toast.error(result.message);
        return;
      }
      setSent(true);
      toast.success(result.message);
    });
  }

  function verify() {
    startTransition(async () => {
      const result = await verifyBindingEmail({ email, code });
      if (!result.success) {
        if (result.requiresSecondFactor) {
          router.push(`/account/verify-2fa?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      if (result.reloginRequired) {
        await signOut({ redirectTo: "/login?callbackUrl=/" });
        return;
      }
      await update();
      router.replace(safeCallback);
      router.refresh();
    });
  }

  return <div className="space-y-5">
    {sent ? <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm"><MailCheck className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{t("emailCodeSent", { email })}</span></div> : null}
    <div className="space-y-2"><Label htmlFor="binding-email">{t("email")}</Label><Input id="binding-email" className="h-11" type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent || pending} /></div>
    {sent && <div className="space-y-2"><Label htmlFor="binding-code">{t("verificationCode")}</Label><Input id="binding-code" className="h-12 text-center font-mono text-xl tracking-[0.35em]" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus /></div>}
    <Button className="h-11 w-full" disabled={pending || (sent ? code.length !== 6 : !email)} onClick={sent ? verify : send}>
      {pending ? <Loader2 className="animate-spin" /> : sent ? <MailCheck /> : <Mail />}{sent ? t("completeVerification") : t("sendVerificationCode")}
    </Button>
    {sent && <Button className="w-full" variant="ghost" disabled={pending} onClick={() => { setSent(false); setCode(""); }}><ArrowLeft />{t("changeEmail")}</Button>}
  </div>;
}
