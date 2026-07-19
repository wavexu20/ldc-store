import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import { getProductBySlug } from "@/lib/actions/products";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Clock3, PackageCheck, ShoppingBag } from "lucide-react";
import { OrderForm } from "./order-form";
import { renderMarkdownToSafeHtml } from "@/lib/markdown";
import { ProductImageGallery } from "./product-image-gallery";
import { RestockRequestInline } from "@/components/store/restock-request-inline";
import { getTranslator } from "@/lib/i18n-server";
import { localizeProduct } from "@/lib/product-i18n";
import { getCheckoutMembership } from "@/lib/actions/wallet";
import { getLocalizedFulfillmentLabel, isManualFulfillment } from "@/lib/fulfillment";
import { getProductReviewData } from "@/lib/actions/reviews";
import { ReviewSection } from "./review-section";

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

async function getProductReviewDataSafely(productId: string) {
  try {
    return await getProductReviewData(productId);
  } catch (error) {
    console.error("[ProductPage] Failed to load product reviews", error);
    return {
      summary: { total: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
      reviews: [], page: 1, totalPages: 1, eligibleOrders: [], ownReviews: [], isLoggedIn: false,
    };
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
  const reviewData = await getProductReviewDataSafely(product.id);

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

  const fulfillmentLabel = getLocalizedFulfillmentLabel(product.fulfillmentMode, locale);
  const canPurchase = isManualFulfillment(product.fulfillmentMode) || !isOutOfStock;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      {/* Back */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("backHomePage")}
      </Link>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <div className="border-b bg-muted/20 p-4 sm:p-6 lg:border-b-0 lg:border-r">
            {uniqueImageUrls.length > 0 ? (
              <ProductImageGallery
                productName={product.name}
                images={uniqueImageUrls}
                className="mb-0"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-xl border bg-background text-muted-foreground">
                <ShoppingBag className="h-12 w-12 stroke-[1.25]" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col p-5 sm:p-6 lg:p-7">
            <div className="flex flex-wrap gap-2">
              {product.isFeatured && <Badge variant="secondary">{t("popular")}</Badge>}
              {product.category && <Badge variant="outline">{product.category.name}</Badge>}
            </div>

            <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              {product.name}
            </h1>
            {product.description && (
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                {product.description}
              </p>
            )}

            <div className="mt-5 rounded-xl border bg-muted/30 p-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-3xl font-semibold tracking-tight">¥{product.price}</span>
                {hasDiscount && (
                  <span className="text-sm text-muted-foreground line-through">¥{product.originalPrice}</span>
                )}
              </div>
              <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-foreground" aria-hidden="true" />
                  <span>{fulfillmentLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-foreground" aria-hidden="true" />
                  <span className={!canPurchase ? "text-destructive" : undefined}>
                    {isManualFulfillment(product.fulfillmentMode)
                      ? t("sold", { count: product.salesCount })
                      : isOutOfStock
                        ? t("outOfStock")
                        : t("inStockSold", { stock: product.stock, sold: product.salesCount })}
                  </span>
                </div>
              </div>
            </div>

            <div className="my-5 border-t" />

            {canPurchase ? (
              <OrderForm
                productId={product.id}
                productName={product.name}
                price={parseFloat(product.price)}
                stock={product.stock}
                minQuantity={product.minQuantity}
                maxQuantity={product.maxQuantity}
                variants={product.variants}
                membership={membership || undefined}
                inventoryManaged={!isManualFulfillment(product.fulfillmentMode)}
              />
            ) : (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div>
                  <p className="font-medium text-destructive">{t("temporarilyOut")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("restockPriority")}</p>
                </div>
                <div className="mt-4 rounded-xl border bg-background/80 p-3">
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
            )}
          </div>
        </div>
      </section>

      {/* Product Content */}
      {contentHtml && (
        <section className="mt-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-7 lg:p-8">
          <h2 className="mb-6 text-lg font-semibold">{t("productDetails")}</h2>
          <div
            className="prose prose-sm prose-zinc max-w-none dark:prose-invert sm:prose-base"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </section>
      )}

      <ReviewSection productId={product.id} initialData={reviewData} />
    </div>
  );
}
