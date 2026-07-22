import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { renderMarkdownToSafeHtml } from "@/lib/markdown";
import { getProductPreviewByToken } from "@/lib/actions/product-previews";
import { ProductImageGallery } from "../../../product/[slug]/product-image-gallery";
import { MarkdownContent } from "@/components/store/markdown-content";

export const dynamic = "force-dynamic";

export default async function ProductPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await getProductPreviewByToken(token);
  if (!preview) notFound();

  const product = preview.payload;
  const contentHtml = product.content ? renderMarkdownToSafeHtml(product.content) : "";
  const hasDiscount = product.originalPrice !== null && product.originalPrice > product.price;

  return <div className="mx-auto max-w-3xl px-4 py-6">
    <div className="mb-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
      <p className="font-medium">商品临时预览</p>
      <p className="mt-1 text-xs opacity-80">此页面不会上架商品或开放购买，将在 {preview.expiresAt.toLocaleString("zh-CN")} 后失效。</p>
    </div>
    <div className="mb-6 flex items-start justify-between gap-4">
      <div><h1 className="text-xl font-semibold">{product.name}</h1>{product.description ? <p className="mt-1 text-muted-foreground">{product.description}</p> : null}</div>
      <div className="flex shrink-0 gap-2">{product.isFeatured ? <Badge variant="secondary">推荐</Badge> : null}{product.categoryName ? <Badge variant="outline">{product.categoryName}</Badge> : null}</div>
    </div>
    <div className="mb-6 flex items-baseline justify-between rounded-lg border bg-muted/30 p-4"><div className="flex items-baseline gap-2"><span className="text-2xl font-bold">¥{product.price.toFixed(2)}</span>{hasDiscount ? <span className="text-sm text-muted-foreground line-through">¥{product.originalPrice?.toFixed(2)}</span> : null}</div><span className="text-sm text-muted-foreground">预览模式不可购买</span></div>
    {(contentHtml || product.images.length > 0) ? <><Separator className="my-6" /><div><h2 className="mb-3 font-medium">商品详情</h2>{product.images.length > 0 ? <ProductImageGallery productName={product.name} images={product.images} /> : null}{contentHtml ? <MarkdownContent html={contentHtml} className="prose prose-sm prose-zinc max-w-none dark:prose-invert [&_img]:mx-auto [&_img]:max-h-[720px] [&_img]:rounded-xl [&_video]:mx-auto [&_video]:w-full [&_video]:rounded-xl [&_video]:bg-black" /> : null}</div></> : null}
  </div>;
}
