"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { updateExternalStoreLinks, type ExternalStoreLinks } from "@/lib/actions/external-stores";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ExternalStoreSettings({ initialValues }: { initialValues: ExternalStoreLinks }) {
  const [values, setValues] = useState(initialValues);
  const [pending, startTransition] = useTransition();
  function save() { startTransition(async () => { const result = await updateExternalStoreLinks(values); result.success ? toast.success(result.message) : toast.error(result.message); }); }
  const fields: Array<{ key: keyof ExternalStoreLinks; label: string; hint: string }> = [
    { key: "xianyu", label: "闲鱼店铺链接", hint: "用户可在闲鱼购买卡券后回到本站兑换" },
    { key: "liandong", label: "链动小铺店铺链接", hint: "填写你的链动小铺商品页或店铺页" },
    { key: "plati", label: "Plati 店铺链接", hint: "填写 Plati.market 的商品页或店铺页" },
  ];
  return <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Store className="size-5" />第三方购买入口</CardTitle><CardDescription>展示在用户的余额与充值页。留空的平台不会对用户展示。</CardDescription></CardHeader><CardContent className="space-y-4">{fields.map((field) => <div className="space-y-2" key={field.key}><Label htmlFor={`external-${field.key}`}>{field.label}</Label><Input id={`external-${field.key}`} inputMode="url" placeholder="https://..." value={values[field.key]} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} /><p className="text-xs text-muted-foreground">{field.hint}</p></div>)}<Button disabled={pending} onClick={save}>{pending ? <Loader2 className="animate-spin" /> : <ExternalLink />}保存店铺链接</Button></CardContent></Card>;
}
