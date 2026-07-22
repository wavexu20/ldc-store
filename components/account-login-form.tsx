"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Gift, Github, Loader2, Mail, MailCheck, Store } from "lucide-react";
import { SiDiscord, SiHuggingface, SiSteam } from "@icons-pack/react-simple-icons";
import { toast } from "sonner";
import { registerWithEmail, resendEmailVerification, verifyEmailCode } from "@/lib/actions/auth";
import { LinuxDoLogo } from "@/components/icons/linuxdo-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TurnstileWidget } from "@/components/turnstile-widget";
import {
  countPasswordCharacterClasses,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordContainsIdentity,
  strongPasswordSchema,
} from "@/lib/validations/password";
import { useI18n } from "@/components/i18n-provider";
import Link from "next/link";

export function AccountLoginForm({ providers, turnstileSiteKey }: {
  providers: Array<"discord" | "google" | "github" | "huggingface" | "linux-do" | "steam">;
  turnstileSiteKey: string;
}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";
  const [loading, setLoading] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);

  async function oauth(provider: "discord" | "google" | "github" | "huggingface" | "linux-do") {
    setLoading(provider);
    await signIn(provider, { callbackUrl });
  }

  function steamLogin() {
    setLoading("steam");
    window.location.assign(`/api/auth/steam?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  async function emailLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading("email-login");
    try {
      const result = await signIn("email-password", { email, password, redirect: false });
      if (result?.error) {
        toast.error(t("invalidCredentials"));
        return;
      }
      window.location.assign(callbackUrl);
    } catch {
      toast.error(t("invalidCredentials"));
    } finally {
      setLoading(null);
    }
  }

  async function emailRegister(event: React.FormEvent) {
    event.preventDefault();
    const passwordResult = strongPasswordSchema.safeParse(password);
    if (!passwordResult.success) {
      toast.error(passwordResult.error.issues[0].message);
      return;
    }
    if (passwordContainsIdentity(password, { email, name })) {
      toast.error(t("passwordIdentity"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("passwordMismatch"));
      return;
    }
    if (!turnstileToken) {
      toast.error(t("completeCaptcha"));
      return;
    }
    setLoading("email-register");
    const result = await registerWithEmail({ name, email, password, turnstileToken });
    setLoading(null);
    if (!result.success) {
      toast.error(result.message);
      setTurnstileToken(null);
      setTurnstileKey((value) => value + 1);
      return;
    }
    toast.success(result.message);
    if (result.verificationRequired) setVerificationEmail(result.email || email);
  }

  async function verifyEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!verificationEmail) return;
    setLoading("verify-email");
    const result = await verifyEmailCode({ email: verificationEmail, code: verificationCode });
    if (!result.success) {
      setLoading(null);
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    const login = await signIn("email-password", {
      email: verificationEmail,
      password,
      redirect: false,
    });
    setLoading(null);
    if (!login?.error) window.location.assign(callbackUrl);
  }

  async function resendCode() {
    if (!verificationEmail) return;
    setLoading("resend-code");
    const result = await resendEmailVerification(verificationEmail);
    setLoading(null);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  }

  const passwordRules = [
    {
      label: t("passwordLength", { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }),
      met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    {
      label: t("passwordClasses"),
      met: countPasswordCharacterClasses(password) >= 3,
    },
    {
      label: t("passwordIdentity"),
      met: password.length > 0 && !passwordContainsIdentity(password, { email, name }),
    },
  ];
  const passwordReady = passwordRules.every((rule) => rule.met) && password === confirmPassword;

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Store className="size-6" />
        </div>
        <CardTitle className="text-2xl">{t("loginTitle")}</CardTitle>
        <CardDescription>{t("loginDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 px-3 py-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
            <Gift className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium">{t("memberRechargeBenefitTitle")}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t("memberRechargeBenefit")}</p>
          </div>
        </div>
        {verificationEmail ? (
          <form className="space-y-5" onSubmit={verifyEmail}>
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
              <MailCheck className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t("codeSentTo", { email: verificationEmail })}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="verification-code">{t("verificationCode")}</Label>
              <Input id="verification-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" className="h-12 text-center font-mono text-xl tracking-[0.35em]" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))} required autoFocus />
            </div>
            <Button className="h-11 w-full" disabled={!!loading || verificationCode.length !== 6} type="submit">
              {loading === "verify-email" ? <Loader2 className="animate-spin" /> : <Mail />}{loading === "verify-email" ? t("verifying") : t("verifyAndLogin")}
            </Button>
            <div className="flex justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={() => setVerificationEmail(null)}>{t("back")}</Button>
              <Button type="button" variant="ghost" size="sm" disabled={!!loading} onClick={resendCode}>{loading === "resend-code" ? t("sending") : t("resend")}</Button>
            </div>
          </form>
        ) : (
          <>
        <div className="grid grid-cols-2 gap-2">
          <Button className={!providers.includes("discord") ? "hidden" : ""} variant="outline" disabled={!!loading} onClick={() => oauth("discord")}>
            {loading === "discord" ? <Loader2 className="animate-spin" /> : <SiDiscord />}
            Discord
          </Button>
          <Button className={!providers.includes("google") ? "hidden" : ""} variant="outline" disabled={!!loading} onClick={() => oauth("google")}>
            {loading === "google" ? <Loader2 className="animate-spin" /> : <span className="font-bold">G</span>}
            Google
          </Button>
          <Button className={!providers.includes("github") ? "hidden" : ""} variant="outline" disabled={!!loading} onClick={() => oauth("github")}>
            {loading === "github" ? <Loader2 className="animate-spin" /> : <Github />}
            GitHub
          </Button>
          <Button className={!providers.includes("huggingface") ? "hidden" : ""} variant="outline" disabled={!!loading} onClick={() => oauth("huggingface")}>
            {loading === "huggingface" ? <Loader2 className="animate-spin" /> : <SiHuggingface />}
            Hugging Face
          </Button>
          <Button className={!providers.includes("linux-do") ? "hidden" : ""} variant="outline" disabled={!!loading} onClick={() => oauth("linux-do")}>
            {loading === "linux-do" ? <Loader2 className="animate-spin" /> : <LinuxDoLogo />}
            LinuxDo
          </Button>
          <Button className={!providers.includes("steam") ? "hidden" : ""} variant="outline" disabled={!!loading} onClick={steamLogin}>
            {loading === "steam" ? <Loader2 className="animate-spin" /> : <SiSteam />}
            Steam
          </Button>
        </div>

        <div className="relative text-center text-xs text-muted-foreground before:absolute before:left-0 before:top-1/2 before:w-full before:border-t">
          <span className="relative bg-card px-3">{t("orEmail")}</span>
        </div>

        <Tabs defaultValue={initialMode}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">{t("login")}</TabsTrigger>
            <TabsTrigger value="register">{t("register")}</TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <form className="space-y-4 pt-3" onSubmit={emailLogin}>
              <div className="space-y-2"><Label htmlFor="login-email">Email</Label><Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="login-password">{t("password")}</Label><Input id="login-password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <div className="text-right text-sm"><Link className="text-primary hover:underline" href="/account/reset-password">忘记密码？</Link></div>
              <Button className="w-full" disabled={!!loading} type="submit"><Mail />{loading === "email-login" ? t("loggingIn") : t("emailLogin")}</Button>
            </form>
          </TabsContent>
          <TabsContent value="register">
            <form className="space-y-4 pt-3" onSubmit={emailRegister}>
              <div className="space-y-2"><Label htmlFor="register-name">{t("nickname")}</Label><Input id="register-name" minLength={2} maxLength={50} value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="register-email">Email</Label><Input id="register-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="space-y-2">
                <Label htmlFor="register-password">{t("password")}</Label>
                <Input id="register-password" type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <ul className="space-y-1 text-xs">
                  {passwordRules.map((rule) => <li key={rule.label} className={rule.met ? "text-emerald-600" : "text-muted-foreground"}>{rule.met ? "✓" : "○"} {rule.label}</li>)}
                </ul>
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password-confirm">{t("confirmPassword")}</Label>
                <Input id="register-password-confirm" type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                {confirmPassword && password !== confirmPassword ? <p className="text-xs text-destructive">{t("passwordMismatch")}</p> : null}
              </div>
              {turnstileSiteKey ? (
                <TurnstileWidget key={turnstileKey} siteKey={turnstileSiteKey} onVerify={setTurnstileToken} />
              ) : (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{t("captchaUnavailable")}</p>
              )}
              <Button className="w-full" disabled={!!loading || !turnstileToken || !turnstileSiteKey || !passwordReady} type="submit">{loading === "email-register" ? t("creating") : t("createAccount")}</Button>
            </form>
          </TabsContent>
        </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}
