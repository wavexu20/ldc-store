"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, MessageSquareReply, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { deleteAdminReply, replyToReview, setReviewVisibility } from "@/lib/actions/reviews";

export function ReviewActions({ review }: { review: { id: string; status: "published" | "hidden" | "deleted"; adminReply: string | null } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState(review.adminReply || "");

  const refreshAfter = (task: Promise<{ success: boolean; message: string }>, close = false) => startTransition(async () => {
    const result = await task;
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    if (close) setOpen(false);
    router.refresh();
  });

  if (review.status === "deleted") return <span className="text-xs text-muted-foreground">用户已删除</span>;

  return <div className="flex flex-wrap justify-end gap-2">
    <Button size="sm" variant="outline" disabled={pending} onClick={() => refreshAfter(setReviewVisibility(review.id, review.status === "published" ? "hidden" : "published"))}>{review.status === "published" ? <><EyeOff />隐藏</> : <><Eye />公开</>}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" variant="outline"><MessageSquareReply />{review.adminReply ? "编辑回复" : "回复"}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>回复评价</DialogTitle><DialogDescription>回复会在商品评价下方公开展示。</DialogDescription></DialogHeader><Textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={1000} className="min-h-32" placeholder="输入商家回复" /><DialogFooter>{review.adminReply && <Button variant="destructive" disabled={pending} onClick={() => refreshAfter(deleteAdminReply(review.id), true)}><Trash2 />删除回复</Button>}<Button disabled={pending || !reply.trim()} onClick={() => refreshAfter(replyToReview({ reviewId: review.id, reply }), true)}>{pending && <Loader2 className="animate-spin" />}发布回复</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
