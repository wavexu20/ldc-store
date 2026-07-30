"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Mail, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { requestPasswordReset, resetPasswordWithCode } from "@/lib/actions/security";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n-provider";

export function PasswordResetForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function send(event: React.FormEvent) { event.preventDefault(); startTransition(async () => { const result = await requestPasswordReset(email); if (result.success) { setSent(true); toast.success(result.message); } else { toast.error(result.message); } }); }
  function reset(event: React.FormEvent) { event.preventDefault(); startTransition(async () => { const result = await resetPasswordWithCode({ email, code, password }); if (!result.success) { toast.error(result.message); return; } toast.success(result.message); router.replace("/login"); }); }
  return <main className="flex min-h-screen items-center justify-center bg-background px-4"><Card className="w-full max-w-md border shadow-sm"><CardHeader className="space-y-2 border-b pb-5"><CardTitle>{t("resetPassword")}</CardTitle><CardDescription>{sent ? t("resetPasswordSentDescription") : t("resetPasswordDescription")}</CardDescription></CardHeader><CardContent className="pt-6"><form className="space-y-5" onSubmit={sent ? reset : send}>{sent ? <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm"><MailCheck className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{t("emailCodeSent", { email })}</span></div> : null}<div className="space-y-2"><Label htmlFor="reset-email">{t("email")}</Label><Input id="reset-email" className="h-11" type="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={sent || pending} required /></div>{sent && <><div className="space-y-2"><Label htmlFor="reset-code">{t("verificationCode")}</Label><Input id="reset-code" className="h-12 text-center font-mono text-xl tracking-[0.35em]" inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required autoFocus /></div><div className="space-y-2"><Label htmlFor="reset-password">{t("newPassword")}</Label><div className="relative"><Input id="reset-password" className="h-11 pr-10" type={showPassword ? "text" : "password"} minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /><Button className="absolute right-0 top-1 h-9 w-9 text-muted-foreground hover:text-foreground" variant="ghost" size="icon" type="button" aria-label={showPassword ? t("hidePassword") : t("showPassword")} aria-pressed={showPassword} title={showPassword ? t("hidePassword") : t("showPassword")} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div></div></>}<Button className="h-11 w-full" disabled={pending || (sent && (code.length !== 6 || password.length < 10))} type="submit">{pending ? <Loader2 className="animate-spin" /> : sent ? <KeyRound /> : <Mail />}{sent ? t("resetPassword") : t("sendVerificationCode")}</Button>{sent && <Button className="w-full" variant="ghost" type="button" disabled={pending} onClick={() => setSent(false)}><ArrowLeft />{t("changeEmail")}</Button>}</form></CardContent></Card></main>;
}
