"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { sendBindingEmail, verifyBindingEmail } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailBindingForm({ callbackUrl = "/" }: { callbackUrl?: string }) {
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
      result.success ? (setSent(true), toast.success(result.message)) : toast.error(result.message);
    });
  }

  function verify() {
    startTransition(async () => {
      const result = await verifyBindingEmail({ email, code });
      if (!result.success) {
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

  return <div className="space-y-4">
    <div className="space-y-2"><Label htmlFor="binding-email">邮箱</Label><Input id="binding-email" type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent || pending} /></div>
    {sent && <div className="space-y-2"><Label htmlFor="binding-code">验证码</Label><Input id="binding-code" inputMode="numeric" maxLength={6} placeholder="6 位数字" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /><p className="text-xs text-muted-foreground">已发送至 {email}</p></div>}
    <Button className="w-full" disabled={pending || (sent ? code.length !== 6 : !email)} onClick={sent ? verify : send}>
      {pending ? <Loader2 className="animate-spin" /> : <MailCheck />}{sent ? "验证并完成绑定" : "发送验证码"}
    </Button>
    {sent && <Button className="w-full" variant="ghost" disabled={pending} onClick={() => { setSent(false); setCode(""); }}>修改邮箱</Button>}
  </div>;
}
