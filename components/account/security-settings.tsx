"use client";

import { useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { beginTwoFactorSetup, disableTwoFactor, enableTwoFactor, setAccountPassword } from "@/lib/actions/security";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { countPasswordCharacterClasses, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordContainsIdentity } from "@/lib/validations/password";

export type SecurityOverview = {
  email: string;
  name: string;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  recoveryCodesRemaining: number;
};

export function SecuritySettings({ overview }: { overview: SecurityOverview }) {
  const [pending, startTransition] = useTransition();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(overview.twoFactorEnabled);
  const passwordRules = [
    { label: `长度 ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} 位`, met: newPassword.length >= PASSWORD_MIN_LENGTH && newPassword.length <= PASSWORD_MAX_LENGTH },
    { label: "至少包含 3 类字符", met: countPasswordCharacterClasses(newPassword) >= 3 },
    { label: "不包含邮箱或昵称", met: newPassword.length > 0 && !passwordContainsIdentity(newPassword, { email: overview.email, name: overview.name }) },
  ];
  const passwordReady = passwordRules.every((rule) => rule.met) && newPassword === confirmPassword && (!overview.hasPassword || Boolean(currentPassword));

  function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) return toast.error("两次输入的密码不一致");
    startTransition(async () => {
      const result = await setAccountPassword({ currentPassword, password: newPassword });
      result.success ? (toast.success(result.message), setCurrentPassword(""), setNewPassword(""), setConfirmPassword("")) : toast.error(result.message);
    });
  }

  function startSetup() {
    startTransition(async () => {
      const result = await beginTwoFactorSetup();
      if (!result.success || !result.secret || !result.otpauthUrl) {
        toast.error(result.message);
        return;
      }
      setSetup({ secret: result.secret, otpauthUrl: result.otpauthUrl });
    });
  }

  function confirmSetup() {
    if (!setup) return;
    startTransition(async () => {
      const result = await enableTwoFactor({ secret: setup.secret, code: twoFactorCode });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setRecoveryCodes(result.recoveryCodes || []);
      setTwoFactorEnabled(true);
      setSetup(null);
      setTwoFactorCode("");
      toast.success(result.message);
    });
  }

  function turnOff() {
    startTransition(async () => {
      const result = await disableTwoFactor(disableCode);
      result.success ? (toast.success(result.message), window.location.reload()) : toast.error(result.message);
    });
  }

  return <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
    <div><h1 className="text-2xl font-semibold">账号与安全</h1><p className="mt-1 text-sm text-muted-foreground">管理密码和登录验证方式</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="size-5" />密码</CardTitle><CardDescription>{overview.hasPassword ? "设置强密码并定期更新" : "为第三方登录账号设置本地密码"}</CardDescription></CardHeader><CardContent>
      <form className="space-y-4" onSubmit={savePassword}>
        {overview.hasPassword && <div className="space-y-2"><Label htmlFor="current-password">当前密码</Label><Input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></div>}
        <div className="space-y-2"><Label htmlFor="new-password">新密码</Label><Input id="new-password" type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><ul className="space-y-1 text-xs">{passwordRules.map((rule) => <li className={rule.met ? "flex items-center gap-1 text-emerald-600" : "flex items-center gap-1 text-muted-foreground"} key={rule.label}><Check className="size-3" />{rule.label}</li>)}</ul></div>
        <div className="space-y-2"><Label htmlFor="confirm-password">确认新密码</Label><Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />{confirmPassword && confirmPassword !== newPassword ? <p className="text-xs text-destructive">两次输入的密码不一致</p> : null}</div>
        <Button disabled={pending || !passwordReady} type="submit">{pending ? <Loader2 className="animate-spin" /> : <KeyRound />}{overview.hasPassword ? "更新密码" : "设置密码"}</Button>
      </form>
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="size-5" />二次验证</CardTitle><CardDescription>{twoFactorEnabled ? `已开启 · 剩余 ${overview.recoveryCodesRemaining} 个恢复码` : "使用验证器 App 生成一次性验证码"}</CardDescription></CardHeader><CardContent className="space-y-4">
      {recoveryCodes ? <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950"><p className="font-semibold">请立即保存恢复码</p><p className="text-muted-foreground">每个恢复码只能使用一次；丢失验证器时可用于登录。</p><div className="grid grid-cols-2 gap-2 font-mono text-sm">{recoveryCodes.map((code) => <code className="rounded bg-background px-2 py-1" key={code}>{code}</code>)}</div><Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => toast.success("恢复码已复制"))}>复制恢复码</Button></div> : null}
      {!twoFactorEnabled && !setup && <Button disabled={pending} onClick={startSetup}>{pending ? <Loader2 className="animate-spin" /> : <Smartphone />}配置验证器 App</Button>}
      {setup && <div className="space-y-4"><div className="rounded-xl border bg-muted/20 p-5 text-center"><p className="mb-4 text-sm font-medium">使用 Google Authenticator、Microsoft Authenticator 或 1Password 扫描二维码</p><div className="mx-auto inline-flex rounded-lg bg-white p-3"><QRCodeSVG value={setup.otpauthUrl} size={176} level="M" title="Game3DTech verification QR code" /></div><p className="mt-4 text-xs text-muted-foreground">无法扫描？手动输入密钥：</p><code className="mt-2 block select-all break-all rounded bg-background p-2 text-xs">{setup.secret}</code></div><div className="space-y-2"><Label htmlFor="two-factor-code">输入验证器中的 6 位验证码</Label><Input id="two-factor-code" inputMode="numeric" maxLength={6} placeholder="000000" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, ""))} /></div><div className="flex gap-2"><Button disabled={pending || twoFactorCode.length !== 6} onClick={confirmSetup}>{pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}确认开启</Button><Button variant="ghost" disabled={pending} onClick={() => { setSetup(null); setTwoFactorCode(""); }}>取消</Button></div></div>}
      {twoFactorEnabled && <div className="border-t pt-4"><p className="mb-3 text-sm text-muted-foreground">关闭前，请输入验证器验证码或一组恢复码。</p><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="关闭二次验证验证码" placeholder="6 位验证码或恢复码" value={disableCode} onChange={(event) => setDisableCode(event.target.value)} /><Button variant="destructive" disabled={pending || !disableCode} onClick={turnOff}>关闭二次验证</Button></div></div>}
    </CardContent></Card>
  </div>;
}
