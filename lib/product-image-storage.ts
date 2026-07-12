import "server-only";

import { getAvatarBucket } from "@/lib/avatar-storage";

export const PRODUCT_IMAGE_URL_PREFIX = "/api/product-images/";

export function getProductImageBucket() {
  return getAvatarBucket();
}

export function productImageUrlForKey(key: string) {
  return `${PRODUCT_IMAGE_URL_PREFIX}${key}`;
}

export function productImageKeyFromUrl(value: string | null | undefined) {
  if (!value?.startsWith(PRODUCT_IMAGE_URL_PREFIX)) return null;
  const key = value.slice(PRODUCT_IMAGE_URL_PREFIX.length);
  return /^products\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(key) ? key : null;
}
