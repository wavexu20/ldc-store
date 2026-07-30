import Link from "next/link";
import { XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OrderReceiptView } from "@/components/store/order-receipt-view";
import { getOrderReceiptByNo } from "@/lib/actions/orders";
import { getSystemSettings } from "@/lib/actions/system-settings";
import { getTranslator } from "@/lib/i18n-server";

interface OrderReceiptPageProps {
  // Next 在不同渲染路径下可能将 params 包装为 Promise；这里统一 await，避免读取到 undefined。
  params: Promise<{ orderNo: string }>;
}

export default async function OrderReceiptPage({ params }: OrderReceiptPageProps) {
  const { t } = await getTranslator();
  const { orderNo } = await params;
  const [result, settings] = await Promise.all([
    getOrderReceiptByNo(orderNo),
    getSystemSettings(),
  ]);

  if (!result.success || !result.data) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <XCircle className="mx-auto h-12 w-12 text-muted-foreground" />
            <div className="space-y-1">
              <div className="text-lg font-semibold">{t("receiptUnavailable")}</div>
              <div className="text-sm text-muted-foreground">
                {result.message || t("tryAgainLater")}
              </div>
            </div>
            <div className="flex gap-3">
              <Button asChild variant="outline" className="flex-1">
                <Link href="/order/my">{t("myOrders")}</Link>
              </Button>
              <Button asChild className="flex-1">
                <Link href="/">{t("backHomePage")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <OrderReceiptView receipt={result.data} merchantName={settings.siteName} />;
}
