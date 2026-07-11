const RESERVED_EMAIL_DOMAINS = ["oauth.local", "linux.do"];

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isPlaceholderEmail(email?: string | null) {
  if (!email) return true;
  const domain = normalizeEmail(email).split("@")[1] || "";
  return RESERVED_EMAIL_DOMAINS.includes(domain);
}

export function hasVerifiedRealEmail(user: { email?: string | null; emailVerifiedAt?: Date | null }) {
  return Boolean(user.emailVerifiedAt && !isPlaceholderEmail(user.email));
}
