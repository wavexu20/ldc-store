"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Check, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { beginTwoFactorSetup, disableTwoFactor, enableTwoFactor, setAccountPassword } from "@/lib/actions/security";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { countPasswordCharacterClasses, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordContainsIdentity } from "@/lib/validations/password";
import { useI18n } from "@/components/i18n-provider";

export type SecurityOverview = {
  email: string;
  name: string;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  recoveryCodesRemaining: number;
};

export function SecuritySettings({ overview }: { overview: SecurityOverview }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [hasPassword, setHasPassword] = useState(overview.hasPassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(overview.twoFactorEnabled);
  const passwordRules = [
    { label: t("passwordLength", { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }), met: newPassword.length >= PASSWORD_MIN_LENGTH && newPassword.length <= PASSWORD_MAX_LENGTH },
    { label: t("passwordClassesShort"), met: countPasswordCharacterClasses(newPassword) >= 3 },
    { label: t("passwordIdentity"), met: newPassword.length > 0 && !passwordContainsIdentity(newPassword, { email: overview.email, name: overview.name }) },
  ];
  const passwordReady = passwordRules.every((rule) => rule.met) && newPassword === confirmPassword && (!hasPassword || Boolean(currentPassword));

  function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) return toast.error(t("passwordMismatch"));
    startTransition(async () => {
      const result = await setAccountPassword({ currentPassword, password: newPassword });
      if (!result.success) {
        if (result.requiresSecondFactor) {
          router.push("/account/verify-2fa?callbackUrl=%2Faccount%2Fsecurity");
          return;
        }
        toast.error(result.message);
        return;
      }
      setHasPassword(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      router.refresh();
      toast.success(result.message);
    });
  }

  function startSetup() {
    startTransition(async () => {
      const result = await beginTwoFactorSetup();
      if (!result.success || !result.secret || !result.otpauthUrl) {
        if (result.requiresSecondFactor) {
          router.push("/account/verify-2fa?callbackUrl=%2Faccount%2Fsecurity");
          return;
        }
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
        if (result.requiresSecondFactor) {
          router.push("/account/verify-2fa?callbackUrl=%2Faccount%2Fsecurity");
          return;
        }
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
      if (result.success) {
        toast.success(result.message);
        window.location.reload();
      } else {
        toast.error(result.message);
      }
    });
  }

  return <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
    <div><h1 className="text-2xl font-semibold">{t("securityTitle")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("securityDescription")}</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="size-5" />{t("passwordSection")}</CardTitle><CardDescription>{hasPassword ? t("passwordUpdateHint") : t("passwordCreateHint")}</CardDescription></CardHeader><CardContent>
      <form className="space-y-4" onSubmit={savePassword}>
        {hasPassword && <div className="space-y-2"><Label htmlFor="current-password">{t("currentPassword")}</Label><PasswordField id="current-password" value={currentPassword} onChange={setCurrentPassword} visible={showCurrentPassword} onVisibilityChange={setShowCurrentPassword} autoComplete="current-password" /></div>}
        <div className="space-y-2"><Label htmlFor="new-password">{t("newPassword")}</Label><PasswordField id="new-password" value={newPassword} onChange={setNewPassword} visible={showNewPassword} onVisibilityChange={setShowNewPassword} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" /><ul className="space-y-1 text-xs">{passwordRules.map((rule) => <li className={rule.met ? "flex items-center gap-1 text-emerald-600" : "flex items-center gap-1 text-muted-foreground"} key={rule.label}><Check className="size-3" />{rule.label}</li>)}</ul></div>
        <div className="space-y-2"><Label htmlFor="confirm-password">{t("confirmNewPassword")}</Label><PasswordField id="confirm-password" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirmPassword} onVisibilityChange={setShowConfirmPassword} autoComplete="new-password" />{confirmPassword && confirmPassword !== newPassword ? <p className="text-xs text-destructive">{t("passwordMismatch")}</p> : null}</div>
        <Button disabled={pending || !passwordReady} type="submit">{pending ? <Loader2 className="animate-spin" /> : <KeyRound />}{hasPassword ? t("updatePassword") : t("setPassword")}</Button>
      </form>
    </CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="size-5" />{t("twoFactorTitle")}</CardTitle><CardDescription>{twoFactorEnabled ? t("twoFactorEnabledStatus", { count: overview.recoveryCodesRemaining }) : t("twoFactorDescription")}</CardDescription></CardHeader><CardContent className="space-y-4">
      {recoveryCodes ? <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950"><p className="font-semibold">{t("saveRecoveryCodes")}</p><p className="text-muted-foreground">{t("recoveryCodesHint")}</p><div className="grid grid-cols-2 gap-2 font-mono text-sm">{recoveryCodes.map((code) => <code className="rounded bg-background px-2 py-1" key={code}>{code}</code>)}</div><Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => toast.success(t("recoveryCodesCopied")))}>{t("copyRecoveryCodes")}</Button></div> : null}
      {!twoFactorEnabled && !setup && <Button disabled={pending} onClick={startSetup}>{pending ? <Loader2 className="animate-spin" /> : <Smartphone />}{t("configureAuthenticator")}</Button>}
      {setup && <div className="space-y-4"><div className="rounded-xl border bg-muted/20 p-5 text-center"><p className="mb-4 text-sm font-medium">{t("scanAuthenticatorQr")}</p><div className="mx-auto inline-flex rounded-lg bg-white p-3"><QRCodeSVG value={setup.otpauthUrl} size={176} level="M" title="Game3DTech verification QR code" /></div><p className="mt-4 text-xs text-muted-foreground">{t("manualSecret")}</p><code className="mt-2 block select-all break-all rounded bg-background p-2 text-xs">{setup.secret}</code></div><div className="space-y-2"><Label htmlFor="two-factor-code">{t("authenticatorCodeLabel")}</Label><Input id="two-factor-code" inputMode="numeric" maxLength={6} placeholder="000000" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, ""))} /></div><div className="flex gap-2"><Button disabled={pending || twoFactorCode.length !== 6} onClick={confirmSetup}>{pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{t("enableTwoFactor")}</Button><Button variant="ghost" disabled={pending} onClick={() => { setSetup(null); setTwoFactorCode(""); }}>{t("cancel")}</Button></div></div>}
      {twoFactorEnabled && <div className="border-t pt-4"><p className="mb-3 text-sm text-muted-foreground">{t("disableTwoFactorHint")}</p><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label={t("disableTwoFactor")} placeholder={t("twoFactorCodeOrRecovery")} value={disableCode} onChange={(event) => setDisableCode(event.target.value)} /><Button variant="destructive" disabled={pending || !disableCode} onClick={turnOff}>{t("disableTwoFactor")}</Button></div></div>}
    </CardContent></Card>
  </div>;
}

function PasswordField({ id, value, onChange, visible, onVisibilityChange, ...inputProps }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onVisibilityChange: (visible: boolean) => void;
} & Omit<React.ComponentProps<typeof Input>, "id" | "type" | "value" | "onChange">) {
  const { t } = useI18n();
  return <div className="relative">
    <Input {...inputProps} id={id} className="pr-10" type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} required />
    <Button className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground" variant="ghost" size="icon" type="button" aria-label={visible ? t("hidePassword") : t("showPassword")} aria-pressed={visible} title={visible ? t("hidePassword") : t("showPassword")} onClick={() => onVisibilityChange(!visible)}>
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </Button>
  </div>;
}
