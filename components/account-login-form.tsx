"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Github, Loader2, Mail, Store } from "lucide-react";
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

export function AccountLoginForm({ providers, turnstileSiteKey }: {
  providers: Array<"google" | "github" | "linux-do">;
  turnstileSiteKey: string;
}) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const [loading, setLoading] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);

  async function oauth(provider: "google" | "github" | "linux-do") {
    setLoading(provider);
    await signIn(provider, { callbackUrl });
  }

  async function emailLogin(event: React.FormEvent) {
    event.preventDefault();
    setLoading("email-login");
    try {
      const result = await signIn("email-password", { email, password, redirect: false });
      if (result?.error) {
        toast.error("Email 或密码错误");
        return;
      }
      window.location.assign(callbackUrl);
    } catch {
      toast.error("Email 或密码错误");
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
      toast.error("密码不能包含邮箱名前缀或昵称");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    if (!turnstileToken) {
      toast.error("请先完成人机验证");
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
      label: `${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} 个字符`,
      met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    {
      label: "大写、小写、数字、特殊字符中至少 3 类",
      met: countPasswordCharacterClasses(password) >= 3,
    },
    {
      label: "不包含邮箱名前缀或昵称",
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
        <CardTitle className="text-2xl">登录或创建账号</CardTitle>
        <CardDescription>登录后可购买商品、查询订单和管理余额</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {verificationEmail ? (
          <form className="space-y-5" onSubmit={verifyEmail}>
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              验证码已发送至 <strong>{verificationEmail}</strong>，10 分钟内有效。
            </div>
            <div className="space-y-2">
              <Label htmlFor="verification-code">6 位验证码</Label>
              <Input id="verification-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} className="text-center text-2xl tracking-[0.5em]" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ""))} required autoFocus />
            </div>
            <Button className="w-full" disabled={!!loading || verificationCode.length !== 6} type="submit">
              {loading === "verify-email" ? <Loader2 className="animate-spin" /> : <Mail />}验证并登录
            </Button>
            <div className="flex justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={() => setVerificationEmail(null)}>返回</Button>
              <Button type="button" variant="ghost" size="sm" disabled={!!loading} onClick={resendCode}>{loading === "resend-code" ? "发送中…" : "重新发送"}</Button>
            </div>
          </form>
        ) : (
          <>
        <div className="grid grid-cols-3 gap-2">
          <Button className={!providers.includes("google") ? "hidden" : ""} variant="outline" disabled={!!loading} onClick={() => oauth("google")}>
            {loading === "google" ? <Loader2 className="animate-spin" /> : <span className="font-bold">G</span>}
            Google
          </Button>
          <Button className={!providers.includes("github") ? "hidden" : ""} variant="outline" disabled={!!loading} onClick={() => oauth("github")}>
            {loading === "github" ? <Loader2 className="animate-spin" /> : <Github />}
            GitHub
          </Button>
          <Button className={!providers.includes("linux-do") ? "hidden" : ""} variant="outline" disabled={!!loading} onClick={() => oauth("linux-do")}>
            {loading === "linux-do" ? <Loader2 className="animate-spin" /> : <LinuxDoLogo />}
            LinuxDo
          </Button>
        </div>

        <div className="relative text-center text-xs text-muted-foreground before:absolute before:left-0 before:top-1/2 before:w-full before:border-t">
          <span className="relative bg-card px-3">或使用 Email</span>
        </div>

        <Tabs defaultValue="login">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">登录</TabsTrigger>
            <TabsTrigger value="register">注册</TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <form className="space-y-4 pt-3" onSubmit={emailLogin}>
              <div className="space-y-2"><Label htmlFor="login-email">Email</Label><Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="login-password">密码</Label><Input id="login-password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <Button className="w-full" disabled={!!loading} type="submit"><Mail />{loading === "email-login" ? "登录中…" : "Email 登录"}</Button>
            </form>
          </TabsContent>
          <TabsContent value="register">
            <form className="space-y-4 pt-3" onSubmit={emailRegister}>
              <div className="space-y-2"><Label htmlFor="register-name">昵称</Label><Input id="register-name" minLength={2} maxLength={50} value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="register-email">Email</Label><Input id="register-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="space-y-2">
                <Label htmlFor="register-password">密码</Label>
                <Input id="register-password" type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <ul className="space-y-1 text-xs">
                  {passwordRules.map((rule) => <li key={rule.label} className={rule.met ? "text-emerald-600" : "text-muted-foreground"}>{rule.met ? "✓" : "○"} {rule.label}</li>)}
                </ul>
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password-confirm">确认密码</Label>
                <Input id="register-password-confirm" type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                {confirmPassword && password !== confirmPassword ? <p className="text-xs text-destructive">两次输入的密码不一致</p> : null}
              </div>
              {turnstileSiteKey ? (
                <TurnstileWidget key={turnstileKey} siteKey={turnstileSiteKey} onVerify={setTurnstileToken} />
              ) : (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">Turnstile Site Key 未配置，Email 注册暂不可用。</p>
              )}
              <Button className="w-full" disabled={!!loading || !turnstileToken || !turnstileSiteKey || !passwordReady} type="submit">{loading === "email-register" ? "创建中…" : "创建账号"}</Button>
            </form>
          </TabsContent>
        </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}
