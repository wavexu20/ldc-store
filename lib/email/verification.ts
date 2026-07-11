import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, emailVerificationTokens } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email/cloudflare";

function createCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

export async function hashVerificationCode(email: string, code: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 未配置");
  const data = new TextEncoder().encode(`${email.toLowerCase()}:${code}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function issueEmailVerification(input: {
  userId: string;
  email: string;
  name?: string | null;
}) {
  const latest = await db.query.emailVerificationTokens.findFirst({
    where: eq(emailVerificationTokens.userId, input.userId),
    orderBy: [desc(emailVerificationTokens.createdAt)],
  });
  if (latest && Date.now() - latest.createdAt.getTime() < 60_000) {
    throw new Error("验证码发送过于频繁，请 60 秒后重试");
  }

  const code = createCode();
  const tokenHash = await hashVerificationCode(input.email, code);
  await db.insert(emailVerificationTokens).values({
    userId: input.userId,
    tokenHash,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  await sendVerificationEmail({ to: input.email, name: input.name, code });
}

export async function findValidVerificationToken(userId: string, tokenHash: string) {
  return db.query.emailVerificationTokens.findFirst({
    where: and(
      eq(emailVerificationTokens.userId, userId),
      eq(emailVerificationTokens.tokenHash, tokenHash),
      isNull(emailVerificationTokens.consumedAt),
      gt(emailVerificationTokens.expiresAt, new Date())
    ),
  });
}
