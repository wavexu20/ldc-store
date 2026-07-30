"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MessageSquareText, Star, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/i18n-provider";
import { deleteOwnProductReview, getProductReviewData, submitProductReview, updateOwnProductReview } from "@/lib/actions/reviews";
import { ratingDistributionPercent } from "@/lib/reviews";
import { cn } from "@/lib/utils";

type ReviewData = Awaited<ReturnType<typeof getProductReviewData>>;

function Stars({ value, label }: { value: number; label: string }) {
  return <div className="flex items-center gap-0.5" aria-label={label}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} className={cn("h-4 w-4", star <= Math.round(value) ? "fill-foreground text-foreground" : "text-muted-foreground/35")} aria-hidden="true" />)}</div>;
}

function RatingPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const { t } = useI18n();
  return <div className="flex gap-1">{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" onClick={() => onChange(star)} className="rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("stars", { count: star })}><Star className={cn("h-6 w-6", star <= value ? "fill-foreground text-foreground" : "text-muted-foreground/40")} /></button>)}</div>;
}

export function ReviewSection({ productId, initialData }: { productId: string; initialData: ReviewData }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reviews, setReviews] = useState(initialData.reviews);
  const [page, setPage] = useState(initialData.page);
  const [orderId, setOrderId] = useState(initialData.eligibleOrders[0]?.id || "");
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState<ReviewData["ownReviews"][number] | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editContent, setEditContent] = useState("");
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }), [locale]);

  const submit = () => startTransition(async () => {
    const result = await submitProductReview({ orderId, rating, content });
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    toast.success(t("reviewPublished"));
    setContent("");
    router.refresh();
  });

  const saveEdit = () => {
    if (!editing) return;
    startTransition(async () => {
      const result = await updateOwnProductReview({ reviewId: editing.id, rating: editRating, content: editContent });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(t("reviewUpdated"));
      setEditing(null);
      router.refresh();
    });
  };

  const remove = (reviewId: string) => startTransition(async () => {
    const result = await deleteOwnProductReview(reviewId);
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    toast.success(t("reviewDeleted"));
    router.refresh();
  });

  const loadMore = () => startTransition(async () => {
    const next = await getProductReviewData(productId, page + 1);
    setReviews((current) => [...current, ...next.reviews.filter((item) => !current.some((existing) => existing.id === item.id))]);
    setPage(next.page);
  });

  return (
    <section className="mt-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-7 lg:p-8">
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div>
          <div className="flex items-center gap-2"><MessageSquareText className="h-5 w-5" /><h2 className="text-lg font-semibold">{t("customerReviews")}</h2></div>
          <div className="mt-5 flex items-end gap-2"><span className="text-4xl font-semibold tabular-nums">{initialData.summary.average.toFixed(1)}</span><span className="pb-1 text-sm text-muted-foreground">/ 5</span></div>
          <div className="mt-2"><Stars value={initialData.summary.average} label={t("stars", { count: initialData.summary.average })} /></div>
          <p className="mt-2 text-sm text-muted-foreground">{t("basedOnReviews", { count: initialData.summary.total })}</p>
          <div className="mt-5 space-y-2">{[5, 4, 3, 2, 1].map((star) => { const count = initialData.summary.distribution[star as 1 | 2 | 3 | 4 | 5]; return <div className="grid grid-cols-[28px_1fr_28px] items-center gap-2 text-xs text-muted-foreground" key={star}><span>{star}★</span><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground" style={{ width: `${ratingDistributionPercent(count, initialData.summary.total)}%` }} /></div><span className="text-right tabular-nums">{count}</span></div>; })}</div>
        </div>

        <div className="min-w-0 lg:border-l lg:pl-7">
          {initialData.eligibleOrders.length > 0 ? <div className="rounded-xl border bg-muted/20 p-4 sm:p-5"><h3 className="font-medium">{t("writeReview")}</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>{t("selectOrder")}</Label><Select value={orderId} onValueChange={setOrderId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{initialData.eligibleOrders.map((order) => <SelectItem key={order.id} value={order.id}>{order.orderNo}{order.variantName ? ` · ${order.variantName}` : ""}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>{t("rating")}</Label><RatingPicker value={rating} onChange={setRating} /></div></div><div className="mt-4 space-y-2"><Label>{t("reviewContent")}</Label><Textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={1000} placeholder={t("reviewPlaceholder")} className="min-h-28 resize-y" /><div className="text-right text-xs text-muted-foreground">{content.length}/1000</div></div><Button disabled={pending || !orderId || content.trim().length < 5} onClick={submit}>{pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{t("publishReview")}</Button></div> : <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{initialData.isLoggedIn ? t("purchaseToReview") : t("loginToReview")}</div>}

          {initialData.ownReviews.length > 0 && <div className="mt-6"><h3 className="text-sm font-medium">{t("yourReviews")}</h3><div className="mt-3 space-y-3">{initialData.ownReviews.map((review) => <div key={review.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><Stars value={review.rating} label={t("stars", { count: review.rating })} />{review.status === "hidden" && <Badge variant="secondary">{t("hiddenByAdmin")}</Badge>}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{review.content}</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditing(review); setEditRating(review.rating); setEditContent(review.content); }}>{t("editReview")}</Button><Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => remove(review.id)}><Trash2 />{t("deleteReview")}</Button></div></div>)}</div></div>}

          <div className="mt-7 space-y-4">{reviews.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">{t("noReviews")}</div> : reviews.map((review) => <article className="border-b pb-5 last:border-b-0" key={review.id}><div className="flex items-start gap-3"><Avatar className="h-9 w-9"><AvatarImage src={review.userImage || undefined} /><AvatarFallback>{(review.userName || "U").slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{review.userName || t("verifiedPurchase")}</span><Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" />{t("verifiedPurchase")}</Badge></div><time className="text-xs text-muted-foreground">{dateFormatter.format(new Date(review.createdAt))}</time></div><div className="mt-1 flex flex-wrap items-center gap-2"><Stars value={review.rating} label={t("stars", { count: review.rating })} />{review.variantName && <span className="text-xs text-muted-foreground">{review.variantName}</span>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{review.content}</p>{review.adminReply && <div className="mt-4 rounded-lg bg-muted/50 p-3"><div className="flex items-center gap-2 text-xs font-medium"><Store className="h-3.5 w-3.5" />{t("merchantReply")}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{review.adminReply}</p></div>}</div></div></article>)}{page < initialData.totalPages && <Button className="w-full" variant="outline" disabled={pending} onClick={loadMore}>{pending && <Loader2 className="animate-spin" />}{t("loadMoreReviews")}</Button>}</div>
        </div>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>{t("editReview")}</DialogTitle><DialogDescription>{t("reviewPlaceholder")}</DialogDescription></DialogHeader><div className="space-y-4"><RatingPicker value={editRating} onChange={setEditRating} /><Textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} maxLength={1000} className="min-h-32" /></div><DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>{t("cancel")}</Button><Button disabled={pending || editContent.trim().length < 5} onClick={saveEdit}>{pending && <Loader2 className="animate-spin" />}{t("editReview")}</Button></DialogFooter></DialogContent></Dialog>
    </section>
  );
}
