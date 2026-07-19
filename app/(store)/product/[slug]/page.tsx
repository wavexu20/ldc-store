import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import { getProductBySlug } from "@/lib/actions/products";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft } from "lucide-react";
import { OrderForm } from "./order-form";
import { renderMarkdownToSafeHtml } from "@/lib/markdown";
import { ProductImageGallery } from "./product-image-gallery";
import { RestockRequestInline } from "@/components/store/restock-request-inline";
import { getTranslator } from "@/lib/i18n-server";
import { localizeProduct } from "@/lib/product-i18n";
import { getCheckoutMembership } from "@/lib/actions/wallet";
import { getLocalizedFulfillmentLabel, isManualFulfillment } from "@/lib/fulfillment";

// 强制动态渲染，避免构建时查询数据库（docker build 无需 DATABASE_URL）
export const dynamic = "force-dynamic";

// 为什么这样做：generateMetadata 与页面本体都会读同一份商品数据；用 request 级 memoization 避免重复查库（首跳/预取时延会明显下降）。
const getProductBySlugCached = cache(getProductBySlug);

async function getCheckoutMembershipSafely() {
  try {
    return await getCheckoutMembership();
  } catch (error) {
    // Balance and voucher data enhance checkout, but must never make the
    // product itself unavailable when an account record is temporarily bad.
    console.error("[ProductPage] Failed to load checkout membership", error);
    return null;
  }
}

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { locale, t } = await getTranslator();
  const { slug } = await params;
  const sourceProduct = await getProductBySlugCached(slug);

  if (!sourceProduct) {
    return { title: t("productNotFound") };
  }
  const product = localizeProduct(sourceProduct, locale);

  return {
    title: `${product.name} - LDC Store`,
    description: product.description || product.name,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { locale, t } = await getTranslator();
  const { slug } = await params;
  const sourceProduct = await getProductBySlugCached(slug);
  const membership = await getCheckoutMembershipSafely();

  if (!sourceProduct) {
    notFound();
  }
  const product = localizeProduct(sourceProduct, locale);

  const isOutOfStock = product.stock === 0;
  const hasDiscount =
    product.originalPrice &&
    parseFloat(product.originalPrice) > parseFloat(product.price);
  const contentHtml = product.content
    ? renderMarkdownToSafeHtml(product.content)
    : "";
  const imageUrls = [
    product.coverImage,
    ...(product.images ?? []),
  ].filter((url): url is string => typeof url === "string" && url.trim().length > 0);
  const uniqueImageUrls = Array.from(new Set(imageUrls));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Back */}
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("backHomePage")}
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{product.name}</h1>
            {product.description && (
              <p className="mt-1 text-muted-foreground">{product.description}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {product.isFeatured && (
              <Badge variant="secondary">{t("popular")}</Badge>
            )}
            {product.category && (
              <Badge variant="outline">{product.category.name}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Price & Stock */}
      <div className="mb-6 flex items-baseline justify-between rounded-lg border bg-muted/30 p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">¥{product.price}</span>
          {hasDiscount && (
            <span className="text-sm text-muted-foreground line-through">
              ¥{product.originalPrice}
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          <span className={isOutOfStock && !isManualFulfillment(product.fulfillmentMode) ? "text-destructive" : undefined}>
            {getLocalizedFulfillmentLabel(product.fulfillmentMode, locale)}
            {!isManualFulfillment(product.fulfillmentMode)
              ? isOutOfStock
                ? ` · ${t("outOfStock")}`
                : ` · ${t("inStockSold", { stock: product.stock, sold: product.salesCount })}`
              : ""}
          </span>
        </div>
      </div>

      {/* Order Form */}
      {isOutOfStock ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6">
          <div className="text-center">
            <p className="font-medium text-destructive">{t("temporarilyOut")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("restockPriority")}
            </p>
          </div>

          <div className="mt-4 rounded-xl border bg-background/70 p-4">
            <RestockRequestInline
              productId={product.id}
              productName={product.name}
              initialCount={product.restockRequestCount}
              initialRequesters={product.restockRequesters}
              maxAvatars={6}
              size="md"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border p-6">
          <OrderForm
            productId={product.id}
            productName={product.name}
            price={parseFloat(product.price)}
            stock={product.stock}
            minQuantity={product.minQuantity}
            maxQuantity={product.maxQuantity}
            variants={product.variants}
            membership={membership || undefined}
          />
        </div>
      )}

      {/* Product Content */}
      {(contentHtml || uniqueImageUrls.length > 0) && (
        <>
          <Separator className="my-6" />
          <div>
            <h2 className="mb-3 font-medium">{t("productDetails")}</h2>
            {uniqueImageUrls.length > 0 && (
              <ProductImageGallery
                productName={product.name}
                images={uniqueImageUrls}
              />
            )}
            {contentHtml && (
              <div
                className="prose prose-sm prose-zinc max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
