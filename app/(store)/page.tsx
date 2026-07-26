import { Suspense } from "react";
import { ProductCard } from "@/components/store/product-card";
import { getActiveProducts } from "@/lib/actions/products";
import { getActiveCategories } from "@/lib/actions/categories";
import { getActiveAnnouncements } from "@/lib/actions/announcements";
import { Skeleton } from "@/components/ui/skeleton";
import { Package } from "lucide-react";
import { AnnouncementBanner } from "@/components/store/announcement-banner";
import { renderMarkdownToSafeHtml } from "@/lib/markdown";
import {
  FilterableProductItem,
  HomeCategoryFilter,
} from "@/components/store/home-category-filter";
import { getTranslator } from "@/lib/i18n-server";
import { localizeProducts } from "@/lib/product-i18n";
import { localizeCategory } from "@/lib/category-i18n";
import { localizeAnnouncement } from "@/lib/announcement-i18n";

// 强制动态渲染，避免构建时查询数据库
export const dynamic = "force-dynamic";

async function HomeProductSection() {
  const { locale, t } = await getTranslator();
  const [categories, products] = await Promise.all([
    getActiveCategories(),
    getActiveProducts({ limit: 100 }),
  ]);

  const localizedProducts = localizeProducts(products, locale);
  const categoryTabs = categories.map((item) => {
    const category = localizeCategory(item, locale);
    return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    };
  });

  if (localizedProducts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Package className="mb-4 h-12 w-12 opacity-50" />
        <p className="text-lg font-medium">{t("noProducts")}</p>
        <p className="mt-1 text-sm">{t("comeBackLater")}</p>
      </div>
    );
  }

  return (
    <HomeCategoryFilter categories={categoryTabs}>
      {localizedProducts.map((product) => (
        <FilterableProductItem
          key={product.id}
          categoryId={product.categoryId ?? null}
        >
          <ProductCard
            id={product.id}
            name={product.name}
            slug={product.slug}
            price={product.price}
            originalPrice={product.originalPrice}
            coverImage={product.coverImage}
            stock={product.stock}
            fulfillmentMode={product.fulfillmentMode}
            isFeatured={product.isFeatured}
            salesCount={product.salesCount}
            category={product.category}
            restockRequestCount={product.restockRequestCount}
            restockRequesters={product.restockRequesters}
          />
        </FilterableProductItem>
      ))}
    </HomeCategoryFilter>
  );
}

function ProductGridSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
        >
          <Skeleton className="aspect-video w-full" />
          <div className="space-y-2 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <div className="flex flex-wrap gap-2 pt-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export default async function HomePage() {
  const [{ locale }, announcements] = await Promise.all([
    getTranslator(),
    getActiveAnnouncements(),
  ]);
  const bannerItems = announcements.map((item) => {
    const announcement = localizeAnnouncement(item, locale);
    return {
    id: announcement.id,
    title: announcement.title,
    // 关键：在服务端完成 Markdown → 安全 HTML，避免把 sanitize-html 打进客户端包
    contentHtml: renderMarkdownToSafeHtml(announcement.content),
    updatedAt: announcement.updatedAt.toISOString(),
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AnnouncementBanner announcements={bannerItems} />

      {/* Categories */}
      <div className="mb-8">
        <Suspense
          fallback={
            <div className="space-y-6">
              <Skeleton className="h-9 w-64" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(15rem,18rem))]">
                <ProductGridSkeleton />
              </div>
            </div>
          }
        >
          <HomeProductSection />
        </Suspense>
      </div>
    </div>
  );
}
