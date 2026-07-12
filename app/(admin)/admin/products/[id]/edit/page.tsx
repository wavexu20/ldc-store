"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { getProductById, updateProduct } from "@/lib/actions/products";
import {
  getAdminCategories,
  type AdminCategoryOption,
} from "@/lib/actions/categories";
import { type ProductInput } from "@/lib/validations/product";
import {
  ProductForm,
  type ProductFormInventory,
} from "@/components/admin/products/product-form";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default function EditProductPage({ params }: EditProductPageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState<AdminCategoryOption[]>([]);
  const [initialData, setInitialData] = useState<Partial<ProductInput>>({});
  const [inventory, setInventory] = useState<ProductFormInventory>();

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);

      try {
        const [product, categoriesResult] = await Promise.all([
          getProductById(id),
          getAdminCategories(),
        ]);

        if (!isMounted) return;

        if (!product) {
          toast.error("商品不存在");
          router.push("/admin/products");
          return;
        }

        setCategories(categoriesResult);
        setInventory({
          publicStock: product.publicStock,
          inactiveStock: product.inactiveStock,
          variantStock: Object.fromEntries(
            product.variants.map((variant) => [variant.id, variant.stock])
          ),
        });
        setInitialData({
          name: product.name,
          slug: product.slug,
          categoryId: product.categoryId ?? null,
          description: product.description || "",
          content: product.content || "",
          price: parseFloat(product.price),
          originalPrice: product.originalPrice
            ? parseFloat(product.originalPrice)
            : undefined,
          coverImage: product.coverImage || "",
          images: Array.from(new Set([product.coverImage, ...(product.images ?? [])].filter((image): image is string => Boolean(image)))),
          variants: product.variants.map((variant) => ({ id: variant.id, name: variant.name, price: Number(variant.price), originalPrice: variant.originalPrice ? Number(variant.originalPrice) : undefined, sortOrder: variant.sortOrder })),
          isActive: product.isActive,
          isFeatured: product.isFeatured,
          sortOrder: product.sortOrder,
          minQuantity: product.minQuantity,
          maxQuantity: product.maxQuantity,
          autoTranslate: false,
          translationSourceLocale: "zh",
        });
      } catch (error) {
        if (!isMounted) return;
        console.error("加载商品失败:", error);
        toast.error("加载商品失败");
        router.push("/admin/products");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [id, router]);

  const handleSubmit = async (values: ProductInput) => {
    return updateProduct(id, values);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-96" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <ProductForm
      initialData={initialData}
      categories={categories}
      onSubmit={handleSubmit}
      isEdit={true}
      productId={id}
      inventory={inventory}
    />
  );
}
