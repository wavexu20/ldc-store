import type { Locale } from "@/lib/i18n";
import type { ProductTranslations } from "@/lib/db/schema";

type TranslatableProduct = {
  name: string;
  description: string | null;
  content?: string | null;
  translations?: ProductTranslations | null;
};

export function localizeProduct<T extends TranslatableProduct>(
  product: T,
  locale: Locale
): T {
  const translation = product.translations?.[locale];
  if (!translation) return product;

  return {
    ...product,
    name: translation.name?.trim() || product.name,
    description: translation.description?.trim() || product.description,
    ...(Object.prototype.hasOwnProperty.call(product, "content")
      ? { content: translation.content?.trim() || product.content }
      : {}),
  };
}

export function localizeProducts<T extends TranslatableProduct>(
  products: T[],
  locale: Locale
): T[] {
  return products.map((product) => localizeProduct(product, locale));
}
