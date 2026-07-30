import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export const AVATAR_URL_PREFIX = "/api/avatars/";

export function getAvatarBucket() {
  const { env } = getCloudflareContext();
  const bucket = (env as unknown as { AVATARS?: R2Bucket }).AVATARS;
  if (!bucket) throw new Error("Cloudflare R2 头像存储未配置");
  return bucket;
}

export function avatarUrlForKey(key: string) {
  return `${AVATAR_URL_PREFIX}${key}`;
}

export function avatarKeyFromUrl(value: string | null | undefined) {
  if (!value?.startsWith(AVATAR_URL_PREFIX)) return null;
  const key = value.slice(AVATAR_URL_PREFIX.length);
  return /^avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(key) ? key : null;
}
