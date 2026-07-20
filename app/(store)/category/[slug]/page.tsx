import { notFound } from "next/navigation";
import Link from "next/link";
import { getCategoryBySlug } from "@/lib/actions/categories";
import { getActiveProducts } from "@/lib/actions/products";
import { ProductCard } from "@/components/store/product-card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Package, Grid3X3 } from "lucide-react";
import { getTranslator } from "@/lib/i18n-server";
import { localizeProducts } from "@/lib/product-i18n";

// 强制动态渲染，避免构建时查询数据库（docker build 无需 DATABASE_URL）
export const dynamic = "force-dynamic";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps) {
  const { t } = await getTranslator();
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    return { title: t("categoryNotFound") };
  }

  return {
    title: `${category.name} - Game3DTech`,
    description: category.description || t("categoryProducts", { name: category.name }),
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { locale, t } = await getTranslator();
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const products = await getActiveProducts({
    categoryId: category.id,
    limit: 50,
  });
  const localizedProducts = localizeProducts(products, locale);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/" className="hover:text-violet-600">
          {t("home")}
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180" />
        <span className="text-zinc-900 dark:text-zinc-100">{category.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
            <Grid3X3 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {category.name}
            </h1>
            {category.description && (
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                {category.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      {localizedProducts.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(15rem,18rem))]">
          {localizedProducts.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              name={product.name}
              slug={product.slug}
              description={product.description}
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
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="h-16 w-16 text-zinc-300 dark:text-zinc-700" />
          <h3 className="mt-4 text-lg font-medium text-zinc-900 dark:text-zinc-100">
            {t("emptyCategory")}
          </h3>
          <p className="mt-2 text-sm text-zinc-500">{t("productsComingSoon")}</p>
          <Link href="/" className="mt-6">
            <Button variant="outline" className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              {t("backHomePage")}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
