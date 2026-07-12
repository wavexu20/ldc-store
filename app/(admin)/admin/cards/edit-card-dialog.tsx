"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateCard } from "@/lib/actions/cards";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";

interface EditCardDialogProps {
  cardId: string;
  currentContent: string;
  currentVariantId: string | null;
  variants: Array<{ id: string; name: string }>;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function EditCardDialog({
  cardId,
  currentContent,
  currentVariantId,
  variants,
  disabled = false,
  children,
}: EditCardDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(currentContent);
  const [variantId, setVariantId] = useState(currentVariantId ?? "public");
  const [isPending, startTransition] = useTransition();

  const handleUpdate = () => {
    if (!content.trim()) {
      toast.error("卡密内容不能为空");
      return;
    }

    const nextVariantId = variants.length > 0 ? variantId : "public";
    if (variants.length > 0 && nextVariantId === "public") {
      toast.error("请选择卡密归属的规格");
      return;
    }

    if (content === currentContent && nextVariantId === (currentVariantId ?? "public")) {
      toast.info("内容和库存归属均未修改");
      setOpen(false);
      return;
    }

    startTransition(async () => {
      const result = await updateCard({
        cardId,
        content: content.trim(),
        variantId: nextVariantId === "public" ? null : nextVariantId,
      });

      if (result.success) {
        toast.success(result.message);
        setOpen(false);
        // 为什么这样做：卡密内容变更需要刷新服务端列表数据，避免表格仍显示旧值。
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      // 重置为当前内容
      setContent(currentContent);
      setVariantId(currentVariantId ?? "public");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={disabled}
            title={disabled ? "已售出的卡密不能编辑" : "编辑卡密"}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            编辑卡密
          </DialogTitle>
          <DialogDescription>
            修改卡密内容，已售出的卡密不可编辑
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>卡密内容</Label>
            <Textarea
              placeholder="输入卡密内容"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>库存归属</Label>
            <Select value={variantId} onValueChange={setVariantId}>
              <SelectTrigger><SelectValue placeholder="选择库存归属" /></SelectTrigger>
              <SelectContent>
                {variants.length === 0 ? <SelectItem value="public">公共库存</SelectItem> : variants.map((variant) => <SelectItem key={variant.id} value={variant.id}>{variant.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">单规格使用公共库存；多规格必须归属到具体规格。</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={isPending || !content.trim()}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
