import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { hasVerifiedRealEmail } from "@/lib/email-address";
import { EmailBindingForm } from "@/components/account/email-binding-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";

export const dynamic = "force-dynamic";

export default async function CompleteProfilePage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.id === "admin") redirect("/login");
  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id), columns: { email: true, emailVerifiedAt: true } });
  const { callbackUrl } = await searchParams;
  if (user && hasVerifiedRealEmail(user)) redirect(callbackUrl?.startsWith("/") ? callbackUrl : "/");
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
    <Card className="w-full max-w-md shadow-lg"><CardHeader><CardTitle>绑定邮箱</CardTitle><CardDescription>用于接收订单与安全通知</CardDescription></CardHeader><CardContent><EmailBindingForm callbackUrl={callbackUrl} /></CardContent></Card>
    <Toaster position="top-center" richColors />
  </main>;
}
