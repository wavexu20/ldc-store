import "server-only";

import { getAvatarBucket } from "@/lib/avatar-storage";

export const PRODUCT_MEDIA_URL_PREFIX = "/api/product-media/";

export function getProductMediaBucket() {
  return getAvatarBucket();
}

export function productMediaUrlForKey(key: string) {
  return `${PRODUCT_MEDIA_URL_PREFIX}${key}`;
}

export function productMediaKeyFromUrl(value: string | null | undefined) {
  if (!value?.startsWith(PRODUCT_MEDIA_URL_PREFIX)) return null;
  const key = value.slice(PRODUCT_MEDIA_URL_PREFIX.length);
  return /^product-media\/[0-9a-f-]{36}\.(?:jpg|png|webp|mp4|webm)$/.test(key) ? key : null;
}
