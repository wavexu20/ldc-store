"use client";

import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Flame, Package, Sparkles, TrendingUp } from "lucide-react";
import { RestockRequestInline } from "@/components/store/restock-request-inline";
import { useI18n } from "@/components/i18n-provider";
import { getLocalizedFulfillmentLabel, type FulfillmentMode } from "@/lib/fulfillment";
import { Money } from "@/components/store/money";

interface ProductCardProps {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price: string;
  originalPrice?: string | null;
  coverImage?: string | null;
  stock: number;
  fulfillmentMode?: FulfillmentMode;
  isFeatured?: boolean;
  salesCount?: number;
  category?: {
    name: string;
    slug: string;
  } | null;
  restockRequestCount?: number;
  restockRequesters?: Array<{
    userId: string;
    username: string;
    userImage?: string | null;
  }>;
}

export function ProductCard({
  id,
  name,
  slug,
  description,
  price,
  originalPrice,
  coverImage,
  stock,
  fulfillmentMode = "auto",
  isFeatured,
  salesCount,
  category,
  restockRequestCount = 0,
  restockRequesters = [],
}: ProductCardProps) {
  const { t, locale } = useI18n();
  const isOutOfStock = stock === 0;
  const hasDiscount = originalPrice && parseFloat(originalPrice) > parseFloat(price);
  const discountPercent = hasDiscount
    ? Math.round((1 - parseFloat(price) / parseFloat(originalPrice)) * 100)
    : 0;

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10 focus-within:outline-none focus-within:ring-2 focus-within:ring-primary/30 focus-within:ring-offset-2 focus-within:ring-offset-background active:translate-y-0 active:shadow-lg motion-reduce:transform-none motion-reduce:hover:translate-y-0"
    >
      <Link
        href={`/product/${slug}`}
        aria-label={t("viewProduct", { name })}
        className="absolute inset-0 z-10 rounded-2xl focus:outline-none"
      >
        <span className="sr-only">{t("viewProduct", { name })}</span>
      </Link>

      <div className="relative z-20 flex flex-col pointer-events-none">
      {/* Cover：图像层级更“干净”，内容层与图像层用柔和分割，避免信息挤在同一层导致阅读压力 */}
      <div className="relative aspect-[4/3] overflow-hidden bg-zinc-950">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={name}
            fill
            sizes="(max-width: 639px) 100vw, 288px"
            className="object-cover object-center transition-transform duration-300 motion-safe:group-hover:scale-[1.025] motion-safe:group-focus-within:scale-[1.025] motion-reduce:transform-none"
            unoptimized={coverImage.startsWith("/api/product-images/")}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-primary/10 via-primary/5 to-transparent blur-xl" />
              <Package className="h-12 w-12 text-muted-foreground/40" />
            </div>
          </div>
        )}

        {/* Hover/focus overlay：给触屏/键盘用户“同等反馈”，避免仅依赖 hover */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />

        {/* Badges overlay */}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {isOutOfStock && (
            <Badge variant="secondary" className="border-white/15 bg-black/70 text-xs text-white shadow-sm backdrop-blur-sm">
              {t("soldOut")}
            </Badge>
          )}
          {isFeatured && (
            <Badge className="border-0 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white shadow-lg shadow-orange-500/25 ring-1 ring-white/20 gap-1">
              <Flame className="h-3 w-3 drop-shadow-sm" />
              {t("popular")}
            </Badge>
          )}
          {hasDiscount && (
            <Badge className="border-destructive/20 bg-destructive/10 text-destructive shadow-sm backdrop-blur-sm">
              -{discountPercent}%
            </Badge>
          )}
        </div>

        <Badge variant="secondary" className="absolute bottom-3 left-3 border-white/15 bg-black/65 text-xs text-white backdrop-blur-sm">
          {getLocalizedFulfillmentLabel(fulfillmentMode, locale)}
        </Badge>

        {/* Category tag */}
        {category && (
          <div className="absolute bottom-3 right-3">
            <Badge variant="secondary" className="border-white/15 bg-black/65 text-xs text-white backdrop-blur-sm">
              {category.name}
            </Badge>
          </div>
        )}

        {/* Hover affordance：明确这是可点的卡片（不做强 CTA，避免喧宾夺主） */}
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-1 text-xs text-white/80 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <span>{t("view")}</span>
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-focus-within:-translate-y-0.5 group-focus-within:translate-x-0.5" />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {/* Title + Price：把价格提升到首屏层级（电商转化关键），同时保持信息密度不过载 */}
        <div>
          <h3 className="font-semibold text-[15px] leading-snug line-clamp-1 transition-colors group-hover:text-primary group-focus-within:text-primary">
            {name}
          </h3>
        </div>

        {/* Description */}
        {description && (
          <p className="text-xs text-muted-foreground line-clamp-1">{description}</p>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-2.5">
          <div className="flex items-baseline gap-1.5 tabular-nums">
            <Money amount={price} className="text-lg font-semibold tracking-tight text-foreground" />
            {hasDiscount && <Money amount={originalPrice!} className="text-xs text-muted-foreground line-through" />}
          </div>
          {isOutOfStock ? (
            <div className="pointer-events-auto min-w-0">
              <RestockRequestInline
                productId={id}
                productName={name}
                initialCount={restockRequestCount}
                initialRequesters={restockRequesters}
                maxAvatars={4}
                showSummary={false}
              />
            </div>
          ) : <div className="flex flex-wrap justify-end gap-1.5 text-xs">
            {salesCount !== undefined && salesCount > 0 && (
              <span className="inline-flex items-center gap-1 text-success tabular-nums">
                <TrendingUp className="h-3.5 w-3.5" />
                {t("sold", { count: salesCount })}
              </span>
            )}
            {!isOutOfStock && stock > 0 && stock <= 10 && (
              <span className="inline-flex items-center gap-1 text-warning-foreground tabular-nums dark:text-warning">
                <Sparkles className="h-3.5 w-3.5" />
                {t("onlyLeft", { count: stock })}
              </span>
            )}
          </div>}
        </div>
      </div>
      </div>

      {/* Hover accent line */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-0.5 bg-gradient-to-r from-primary via-primary/80 to-primary scale-x-0 transition-transform duration-300 group-hover:scale-x-100 group-focus-within:scale-x-100" />
    </div>
  );
}
