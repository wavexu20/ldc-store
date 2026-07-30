import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { TwoFactorChallenge } from "@/components/account/two-factor-challenge";
import { Toaster } from "@/components/ui/sonner";

export const dynamic = "force-dynamic";

export default async function VerifyTwoFactorPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.id === "admin") redirect("/login");
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { twoFactorEnabledAt: true } });
  if (!user?.twoFactorEnabledAt) redirect("/");
  const { callbackUrl } = await searchParams;
  return <><TwoFactorChallenge callbackUrl={callbackUrl} /><Toaster position="top-center" richColors /></>;
}
