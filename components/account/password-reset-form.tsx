"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { requestPasswordReset, resetPasswordWithCode } from "@/lib/actions/security";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordResetForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function send(event: React.FormEvent) { event.preventDefault(); startTransition(async () => { const result = await requestPasswordReset(email); result.success ? (setSent(true), toast.success(result.message)) : toast.error(result.message); }); }
  function reset(event: React.FormEvent) { event.preventDefault(); startTransition(async () => { const result = await resetPasswordWithCode({ email, code, password }); if (!result.success) { toast.error(result.message); return; } toast.success(result.message); router.replace("/login"); }); }
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4"><Card className="w-full max-w-md shadow-lg"><CardHeader><CardTitle>重置密码</CardTitle><CardDescription>{sent ? "输入邮件中的验证码并设置新密码" : "输入已验证的邮箱，我们会发送重置验证码"}</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={sent ? reset : send}><div className="space-y-2"><Label htmlFor="reset-email">邮箱</Label><Input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={sent || pending} required /></div>{sent && <><div className="space-y-2"><Label htmlFor="reset-code">验证码</Label><Input id="reset-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required /></div><div className="space-y-2"><Label htmlFor="reset-password">新密码</Label><div className="relative"><Input id="reset-password" className="pr-10" type={showPassword ? "text" : "password"} minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /><Button className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground" variant="ghost" size="icon" type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} title={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div></div></>}<Button className="w-full" disabled={pending || (sent && (code.length !== 6 || password.length < 10))} type="submit">{pending ? <Loader2 className="animate-spin" /> : sent ? <KeyRound /> : <Mail />}{sent ? "重置密码" : "发送验证码"}</Button>{sent && <Button className="w-full" variant="ghost" type="button" disabled={pending} onClick={() => setSent(false)}>更换邮箱</Button>}</form></CardContent></Card></main>;
}
