export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import Link from "next/link";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import { Toaster } from "@/components/ui/sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user as
    | { role?: string; name?: string | null; email?: string | null; image?: string | null }
    | undefined;
  if (user?.role !== "admin") redirect("/admin/login");

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  const isLinuxDoOAuthConfigured = !!(
    process.env.LINUXDO_CLIENT_ID && process.env.LINUXDO_CLIENT_SECRET
  );
  const isLdcPaymentConfigured = !!(
    process.env.LDC_CLIENT_ID && process.env.LDC_CLIENT_SECRET
  );

  const shouldWarn = !isLinuxDoOAuthConfigured || !isLdcPaymentConfigured;

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} />
      <SidebarInset>
        <AdminHeader />
        <div className="flex-1 p-4 md:p-6">
          {shouldWarn ? (
            <Alert className="mb-6 border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle />
              <AlertTitle>检测到关键配置未完成</AlertTitle>
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                <ul className="list-disc pl-4">
                  {!isLinuxDoOAuthConfigured ? (
                    <li>
                      Linux DO OAuth2 未配置（
                      <code>LINUXDO_CLIENT_ID</code> /{" "}
                      <code>LINUXDO_CLIENT_SECRET</code>），用户将无法登录下单/查单。
                    </li>
                  ) : null}
                  {!isLdcPaymentConfigured ? (
                    <li>
                      Linux DO Credit 支付未配置（<code>LDC_CLIENT_ID</code> /{" "}
                      <code>LDC_CLIENT_SECRET</code>），订单无法发起支付。
                    </li>
                  ) : null}
                </ul>
                <p className="mt-2">
                  请前往{" "}
                  <Link href="/admin/settings" className="underline underline-offset-4">
                    系统状态
                  </Link>{" "}
                  查看说明；修改环境变量后需重启服务。
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
          {children}
        </div>
      </SidebarInset>
      <Toaster position="top-center" richColors />
    </SidebarProvider>
  );
}
