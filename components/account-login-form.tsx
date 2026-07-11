"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  Eye,
  EyeOff,
  Github,
  Languages,
  Loader2,
  Mail,
  ShieldCheck,
  Store,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { SiDiscord, SiHuggingface, SiSteam } from "@icons-pack/react-simple-icons";
import { toast } from "sonner";
import { registerWithEmail, resendEmailVerification, verifyEmailCode } from "@/lib/actions/auth";
import { LinuxDoLogo } from "@/components/icons/linuxdo-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TurnstileWidget } from "@/components/turnstile-widget";
import {
  countPasswordCharacterClasses,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordContainsIdentity,
} from "@/lib/validations/password";
import {
  LOGIN_LOCALE_STORAGE_KEY,
  LOGIN_LOCALE_COOKIE,
  localizeAuthMessage,
  loginMessages,
  type LoginLocale,
} from "@/lib/i18n/login";

type SocialProvider = "discord" | "google" | "github" | "huggingface" | "linux-do" | "steam";
type AuthMode = "login" | "register";

const primaryProviderOrder: SocialProvider[] = ["google", "github", "steam", "discord"];
const secondaryProviderOrder: SocialProvider[] = ["huggingface", "linux-do"];

export function AccountLoginForm({ providers, turnstileSiteKey, siteName, initialLocale }: {
  providers: SocialProvider[];
  turnstileSiteKey: string;
  siteName: string;
  initialLocale: LoginLocale;
}) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const oauthErrorCode = searchParams.get("error");
  const [locale, setLocale] = useState<LoginLocale>(initialLocale);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [showMoreProviders, setShowMoreProviders] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showOAuthError, setShowOAuthError] = useState(Boolean(oauthErrorCode));
  const [loading, setLoading] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const t = loginMessages[locale];

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const oauthError = useMemo(() => {
    if (!oauthErrorCode) return null;
    if (oauthErrorCode === "Configuration") return t.configurationError;
    if (oauthErrorCode === "OAuthAccountNotLinked") return t.accountLinkedError;
    if (oauthErrorCode === "AccessDenied") return t.accessDeniedError;
    return t.genericOAuthError;
  }, [oauthErrorCode, t]);

  function toggleLocale() {
    const nextLocale = locale === "zh" ? "en" : "zh";
    setLocale(nextLocale);
    window.localStorage.setItem(LOGIN_LOCALE_STORAGE_KEY, nextLocale);
    document.cookie = `${LOGIN_LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : "en";
  }

  async function oauth(provider: SocialProvider) {
    setLoading(provider);
    if (provider === "steam") {
      window.location.assign(`/api/auth/steam?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }
    await signIn(provider, { callbackUrl });
  }

  async function emailLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading("email-login");
    try {
      const result = await signIn("email-password", { email, password, redirect: false });
      if (result?.error) {
        toast.error(t.emailOrPasswordIncorrect);
        return;
      }
      window.location.assign(callbackUrl);
    } catch {
      toast.error(t.emailOrPasswordIncorrect);
    } finally {
      setLoading(null);
    }
  }

  async function emailRegister(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      toast.error(t.passwordLengthError);
      return;
    }
    if (countPasswordCharacterClasses(password) < 3) {
      toast.error(t.passwordClassesError);
      return;
    }
    if (passwordContainsIdentity(password, { email, name })) {
      toast.error(t.passwordIdentityError);
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t.passwordMismatch);
      return;
    }
    if (!turnstileToken) {
      toast.error(t.humanVerificationRequired);
      return;
    }
    setLoading("email-register");
    const result = await registerWithEmail({ name, email, password, turnstileToken });
    setLoading(null);
    if (!result.success) {
      toast.error(localizeAuthMessage(result.message, locale));
      setTurnstileToken(null);
      setTurnstileKey((value) => value + 1);
      return;
    }
    toast.success(localizeAuthMessage(result.message, locale));
    if (result.verificationRequired) setVerificationEmail(result.email || email);
  }

  async function verifyEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!verificationEmail) return;
    setLoading("verify-email");
    const result = await verifyEmailCode({ email: verificationEmail, code: verificationCode });
    if (!result.success) {
      setLoading(null);
      toast.error(localizeAuthMessage(result.message, locale));
      return;
    }
    toast.success(localizeAuthMessage(result.message, locale));
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
    const message = localizeAuthMessage(result.message, locale);
    if (result.success) toast.success(message);
    else toast.error(message);
  }

  const passwordRules = [
    {
      label: t.passwordLength,
      met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    {
      label: t.passwordClasses,
      met: countPasswordCharacterClasses(password) >= 3,
    },
    {
      label: t.passwordIdentity,
      met: password.length > 0 && !passwordContainsIdentity(password, { email, name }),
    },
  ];
  const passwordReady = passwordRules.every((rule) => rule.met) && password === confirmPassword;
  const primaryProviders = primaryProviderOrder.filter((provider) => providers.includes(provider));
  const secondaryProviders = secondaryProviderOrder.filter((provider) => providers.includes(provider));

  function providerIcon(provider: SocialProvider) {
    if (loading === provider) return <Loader2 className="animate-spin" />;
    if (provider === "discord") return <SiDiscord />;
    if (provider === "google") return <span className="font-bold text-[#4285F4]">G</span>;
    if (provider === "github") return <Github />;
    if (provider === "huggingface") return <SiHuggingface />;
    if (provider === "linux-do") return <LinuxDoLogo />;
    return <SiSteam />;
  }

  function providerName(provider: SocialProvider) {
    return {
      discord: "Discord",
      google: "Google",
      github: "GitHub",
      huggingface: "Hugging Face",
      "linux-do": "Linux DO",
      steam: "Steam",
    }[provider];
  }

  function providerButton(provider: SocialProvider) {
    return (
      <Button
        key={provider}
        className="h-11 cursor-pointer justify-start rounded-xl border-border/80 bg-background px-3 shadow-none transition-colors hover:border-foreground/20 hover:bg-muted/60"
        variant="outline"
        disabled={Boolean(loading)}
        onClick={() => oauth(provider)}
      >
        <span className="flex size-6 items-center justify-center">{providerIcon(provider)}</span>
        <span className="truncate">{providerName(provider)}</span>
      </Button>
    );
  }

  return (
    <section lang={locale === "zh" ? "zh-CN" : "en"} className="relative min-h-dvh overflow-hidden bg-[#f3f5fb] text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 -top-24 size-80 rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-600/15" />
        <div className="absolute -bottom-32 -right-20 size-96 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-700/10" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl items-center px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-[1.75rem] border border-white/80 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-slate-900 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="relative hidden min-h-[680px] flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <div className="absolute -right-24 top-12 size-72 rounded-full bg-indigo-500/30 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 size-72 rounded-full bg-cyan-500/20 blur-3xl" />
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:32px_32px]" />
            </div>

            <div className="relative">
              <Link href="/" className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300 transition-colors hover:text-white">
                <ArrowLeft className="size-4" />
                {t.backToStore}
              </Link>
              <div className="mt-16 flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-lg shadow-indigo-500/20">
                  <Store className="size-5" />
                </span>
                <div>
                  <p className="text-lg font-semibold tracking-tight">{siteName}</p>
                  <p className="text-xs font-medium tracking-[0.2em] text-indigo-300">{t.brandEyebrow}</p>
                </div>
              </div>
            </div>

            <div className="relative max-w-md">
              <h1 className="text-balance text-4xl font-semibold leading-tight tracking-[-0.035em] xl:text-5xl">{t.heroTitle}</h1>
              <p className="mt-5 text-base leading-7 text-slate-300">{t.heroDescription}</p>
              <div className="mt-10 space-y-5">
                {[
                  [Zap, t.instantTitle, t.instantDescription],
                  [WalletCards, t.walletTitle, t.walletDescription],
                  [ShieldCheck, t.securityTitle, t.securityDescription],
                ].map(([Icon, title, description]) => {
                  const BenefitIcon = Icon as typeof Zap;
                  return (
                    <div key={String(title)} className="flex gap-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-indigo-300">
                        <BenefitIcon className="size-5" />
                      </span>
                      <div>
                        <p className="font-medium">{String(title)}</p>
                        <p className="mt-1 text-sm text-slate-400">{String(description)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="relative flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="size-4 text-emerald-400" />
              {t.trustNote}
            </p>
          </aside>

          <div className="flex min-h-[680px] flex-col p-5 sm:p-8 lg:p-12">
            <div className="flex items-center justify-between gap-3">
              <Link href="/" className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground lg:hidden">
                <ArrowLeft className="size-4" />
                {t.backToStore}
              </Link>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="flex size-9 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                  <Store className="size-4" />
                </span>
                <span className="font-semibold tracking-tight">{siteName}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 cursor-pointer rounded-full border px-3 text-xs"
                aria-label={t.languageLabel}
                onClick={toggleLocale}
              >
                <Languages className="size-4" />
                {t.languageName}
              </Button>
            </div>

            <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center py-8 sm:py-10">
              <div className="mb-7">
                <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-indigo-600 dark:text-indigo-300 lg:hidden">{t.brandEyebrow}</p>
                <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                  {verificationEmail ? t.verificationCode : authMode === "login" ? t.welcomeBack : t.createAccount}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {verificationEmail ? t.verificationHint : authMode === "login" ? t.signInDescription : t.registerDescription}
                </p>
              </div>

              {showOAuthError && oauthError ? (
                <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p className="flex-1 leading-5">{oauthError}</p>
                  <button type="button" className="cursor-pointer rounded-md p-0.5 hover:bg-destructive/10" aria-label={t.dismissError} onClick={() => setShowOAuthError(false)}>
                    <X className="size-4" />
                  </button>
                </div>
              ) : null}

              {verificationEmail ? (
                <form className="space-y-5" onSubmit={verifyEmail}>
                  <div className="rounded-xl border bg-muted/40 p-4 text-sm leading-6">
                    {t.verificationSent} <strong className="break-all">{verificationEmail}</strong>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="verification-code">{t.verificationCode}</Label>
                    <Input
                      id="verification-code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className="h-12 rounded-xl text-center text-2xl tracking-[0.45em]"
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))}
                      required
                      autoFocus
                    />
                  </div>
                  <Button className="h-12 w-full cursor-pointer rounded-xl" disabled={Boolean(loading) || verificationCode.length !== 6} type="submit">
                    {loading === "verify-email" ? <Loader2 className="animate-spin" /> : <Mail />}
                    {loading === "verify-email" ? t.verifying : t.verifyAndSignIn}
                  </Button>
                  <div className="flex justify-between">
                    <Button type="button" variant="ghost" className="cursor-pointer" onClick={() => setVerificationEmail(null)}>{t.back}</Button>
                    <Button type="button" variant="ghost" className="cursor-pointer" disabled={Boolean(loading)} onClick={resendCode}>
                      {loading === "resend-code" ? t.sending : t.resend}
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <Tabs value={authMode} onValueChange={(value) => setAuthMode(value as AuthMode)}>
                    <TabsList className="mb-5 grid h-11 w-full grid-cols-2 rounded-xl bg-muted/70 p-1">
                      <TabsTrigger className="cursor-pointer rounded-lg" value="login">{t.signIn}</TabsTrigger>
                      <TabsTrigger className="cursor-pointer rounded-lg" value="register">{t.register}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="login">
                      <form className="space-y-4" onSubmit={emailLogin}>
                        <div className="space-y-2">
                          <Label htmlFor="login-email">{t.email}</Label>
                          <Input id="login-email" className="h-11 rounded-xl" type="email" autoComplete="email" placeholder={t.emailPlaceholder} value={email} onChange={(event) => setEmail(event.target.value)} required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="login-password">{t.password}</Label>
                          <div className="relative">
                            <Input id="login-password" className="h-11 rounded-xl pr-11" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder={t.currentPasswordPlaceholder} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
                            <button type="button" className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground" aria-label={showPassword ? t.hidePassword : t.showPassword} onClick={() => setShowPassword((value) => !value)}>
                              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                          </div>
                        </div>
                        <Button className="h-12 w-full cursor-pointer rounded-xl" disabled={Boolean(loading)} type="submit">
                          {loading === "email-login" ? <Loader2 className="animate-spin" /> : <Mail />}
                          {loading === "email-login" ? t.signingIn : t.emailSignIn}
                        </Button>
                      </form>
                    </TabsContent>

                    <TabsContent value="register">
                      <form className="space-y-4" onSubmit={emailRegister}>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="register-name">{t.displayName}</Label>
                            <Input id="register-name" className="h-11 rounded-xl" autoComplete="nickname" placeholder={t.displayNamePlaceholder} minLength={2} maxLength={50} value={name} onChange={(event) => setName(event.target.value)} required />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="register-email">{t.email}</Label>
                            <Input id="register-email" className="h-11 rounded-xl" type="email" autoComplete="email" placeholder={t.emailPlaceholder} value={email} onChange={(event) => setEmail(event.target.value)} required />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="register-password">{t.password}</Label>
                          <div className="relative">
                            <Input id="register-password" className="h-11 rounded-xl pr-11" type={showPassword ? "text" : "password"} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" placeholder={t.newPasswordPlaceholder} value={password} onChange={(event) => setPassword(event.target.value)} required />
                            <button type="button" className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground" aria-label={showPassword ? t.hidePassword : t.showPassword} onClick={() => setShowPassword((value) => !value)}>
                              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                          </div>
                          <ul className="grid gap-1 pt-1 text-xs text-muted-foreground sm:grid-cols-2">
                            {passwordRules.map((rule) => (
                              <li key={rule.label} className={rule.met ? "text-emerald-600 dark:text-emerald-400" : ""}>
                                <span aria-hidden="true">{rule.met ? "✓" : "○"}</span> {rule.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="register-password-confirm">{t.confirmPassword}</Label>
                          <Input id="register-password-confirm" className="h-11 rounded-xl" type={showPassword ? "text" : "password"} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" placeholder={t.confirmPasswordPlaceholder} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required aria-invalid={Boolean(confirmPassword && password !== confirmPassword)} />
                          {confirmPassword && password !== confirmPassword ? <p role="alert" className="text-xs text-destructive">{t.passwordMismatch}</p> : null}
                        </div>
                        {turnstileSiteKey ? (
                          <TurnstileWidget key={turnstileKey} siteKey={turnstileSiteKey} label={t.turnstileLabel} onVerify={setTurnstileToken} />
                        ) : (
                          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{t.turnstileUnavailable}</p>
                        )}
                        <Button className="h-12 w-full cursor-pointer rounded-xl" disabled={Boolean(loading) || !turnstileToken || !turnstileSiteKey || !passwordReady} type="submit">
                          {loading === "email-register" ? <Loader2 className="animate-spin" /> : null}
                          {loading === "email-register" ? t.creating : t.createButton}
                        </Button>
                      </form>
                    </TabsContent>
                  </Tabs>

                  <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                    <span>{t.continueWith}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {primaryProviders.map(providerButton)}
                  </div>
                  {secondaryProviders.length ? (
                    <div className="mt-3">
                      <button type="button" className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground" aria-expanded={showMoreProviders} onClick={() => setShowMoreProviders((value) => !value)}>
                        {showMoreProviders ? t.hideMethods : t.moreMethods}
                        <ChevronDown className={`size-3.5 transition-transform duration-200 ${showMoreProviders ? "rotate-180" : ""}`} />
                      </button>
                      {showMoreProviders ? <div className="mt-2 grid grid-cols-2 gap-2.5">{secondaryProviders.map(providerButton)}</div> : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
