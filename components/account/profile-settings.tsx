"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Camera, Loader2, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { updateProfile } from "@/lib/actions/account";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProfileOverview = { name: string; email: string; image: string | null; avatarSource: "oauth" | "custom" };

export function ProfileSettings({ profile }: { profile: ProfileOverview }) {
  const [name, setName] = useState(profile.name);
  const [preview, setPreview] = useState(profile.image);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { update } = useSession();
  const initial = (name || profile.email).trim().slice(0, 1).toUpperCase() || "U";

  function selectAvatar(file: File | undefined) {
    if (!file) return;
    if (!/[image\/(jpeg|png|webp)]/.test(file.type)) return toast.error("请选择 JPG、PNG 或 WebP 图片");
    if (file.size > 2 * 1024 * 1024) return toast.error("头像文件不能超过 2 MB");
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const data = new FormData();
    data.set("name", name);
    if (avatarFile) data.set("avatar", avatarFile);
    startTransition(async () => {
      const result = await updateProfile(data);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      await update();
      router.refresh();
      toast.success(result.message);
    });
  }

  return <div className="mx-auto max-w-2xl px-4 py-8">
    <div className="mb-6"><h1 className="text-2xl font-semibold">个人资料</h1><p className="mt-1 text-sm text-muted-foreground">设置商城中显示的昵称和头像</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><UserRound className="size-5" />公开资料</CardTitle><CardDescription>自定义后的昵称和头像不会再被第三方登录资料覆盖。</CardDescription></CardHeader><CardContent>
      <form className="space-y-6" onSubmit={save}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center"><Avatar className="size-20 border"><AvatarImage src={preview || undefined} alt="当前头像" /><AvatarFallback className="text-xl">{initial}</AvatarFallback></Avatar><div className="space-y-2"><p className="text-sm font-medium">头像</p><div className="flex flex-wrap items-center gap-2"><input ref={inputRef} className="sr-only" id="profile-avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectAvatar(event.target.files?.[0])} /><Button type="button" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}><Camera />选择图片</Button>{avatarFile ? <span className="max-w-48 truncate text-xs text-muted-foreground">{avatarFile.name}</span> : <span className="text-xs text-muted-foreground">JPG、PNG 或 WebP，最大 2 MB</span>}</div></div></div>
        <div className="space-y-2"><Label htmlFor="profile-name">昵称</Label><Input id="profile-name" minLength={2} maxLength={50} autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} required /></div>
        <div className="space-y-1"><p className="text-sm font-medium">绑定邮箱</p><p className="text-sm text-muted-foreground">{profile.email}</p></div>
        <Button disabled={pending || name.trim().length < 2} type="submit">{pending ? <Loader2 className="animate-spin" /> : <Save />}保存资料</Button>
      </form>
    </CardContent></Card>
  </div>;
}
