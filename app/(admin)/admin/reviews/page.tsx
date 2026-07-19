import Link from "next/link";
import { CheckCircle2, EyeOff, MessageSquareText, Search, Star, Trash2 } from "lucide-react";
import { getAdminReviews } from "@/lib/actions/reviews";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReviewActions } from "./review-actions";

export const dynamic = "force-dynamic";

const statusLabel = { published: "公开", hidden: "已隐藏", deleted: "用户已删除" } as const;

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string; rating?: string; q?: string }> }) {
  const params = await searchParams;
  const status = ["published", "hidden", "deleted"].includes(params.status || "") ? params.status as "published" | "hidden" | "deleted" : undefined;
  const rating = Number(params.rating) >= 1 && Number(params.rating) <= 5 ? Number(params.rating) : undefined;
  const reviews = await getAdminReviews({ status, rating, query: params.q });

  return <div className="space-y-6 p-4 lg:p-6">
    <div><h1 className="text-2xl font-semibold tracking-tight">评价管理</h1><p className="mt-1 text-sm text-muted-foreground">审核真实购买评价并回复客户。</p></div>
    <div className="grid gap-3 sm:grid-cols-3"><Card><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5" /><div><p className="text-2xl font-semibold">{reviews.filter((item) => item.status === "published").length}</p><p className="text-xs text-muted-foreground">当前列表公开</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-4"><EyeOff className="h-5 w-5" /><div><p className="text-2xl font-semibold">{reviews.filter((item) => item.status === "hidden").length}</p><p className="text-xs text-muted-foreground">当前列表隐藏</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-4"><Trash2 className="h-5 w-5" /><div><p className="text-2xl font-semibold">{reviews.filter((item) => item.status === "deleted").length}</p><p className="text-xs text-muted-foreground">当前列表已删除</p></div></CardContent></Card></div>
    <Card><CardContent className="p-4"><form className="grid gap-3 md:grid-cols-[1fr_180px_160px_auto]" action="/admin/reviews"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input name="q" defaultValue={params.q} className="pl-9" placeholder="商品、订单、用户或评价内容" /></div><Select name="status" defaultValue={status || "all"}><SelectTrigger><SelectValue placeholder="全部状态" /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="published">公开</SelectItem><SelectItem value="hidden">已隐藏</SelectItem><SelectItem value="deleted">用户已删除</SelectItem></SelectContent></Select><Select name="rating" defaultValue={rating ? String(rating) : "all"}><SelectTrigger><SelectValue placeholder="全部评分" /></SelectTrigger><SelectContent><SelectItem value="all">全部评分</SelectItem>{[5,4,3,2,1].map((value) => <SelectItem value={String(value)} key={value}>{value} 星</SelectItem>)}</SelectContent></Select><Button type="submit">筛选</Button></form></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquareText className="h-5 w-5" />评价列表（{reviews.length}）</CardTitle></CardHeader><CardContent>{reviews.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">暂无匹配评价</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>用户 / 订单</TableHead><TableHead>商品</TableHead><TableHead>评价</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{reviews.map((review) => <TableRow key={review.id}><TableCell className="min-w-44"><div className="flex items-center gap-2"><Avatar className="h-8 w-8"><AvatarImage src={review.userImage || undefined} /><AvatarFallback>{(review.userName || "U").slice(0,1)}</AvatarFallback></Avatar><div><p className="text-sm font-medium">{review.userName || "用户"}</p><p className="text-xs text-muted-foreground">{review.orderNo}</p></div></div></TableCell><TableCell className="min-w-48"><Link className="text-sm font-medium hover:underline" href={`/product/${review.productSlug}`} target="_blank">{review.productName}</Link></TableCell><TableCell className="min-w-80 max-w-xl"><div className="flex items-center gap-1">{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`h-4 w-4 ${index < review.rating ? "fill-foreground" : "text-muted-foreground/30"}`} />)}<span className="ml-2 text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString("zh-CN")}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{review.content}</p>{review.adminReply && <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs"><span className="font-medium">商家回复：</span>{review.adminReply}</div>}</TableCell><TableCell><Badge variant={review.status === "published" ? "default" : "secondary"}>{statusLabel[review.status]}</Badge></TableCell><TableCell className="min-w-48 text-right"><ReviewActions review={review} /></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
  </div>;
}
