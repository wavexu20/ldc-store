"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";

import { adminFulfillManualOrder } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ManualFulfillmentCard({
  orderId,
  orderNo,
  quantity,
}: {
  orderId: string;
  orderNo: string;
  quantity: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deliveryContent, setDeliveryContent] = useState("");
  const [remark, setRemark] = useState("");

  const submit = () => {
    startTransition(async () => {
      const result = await adminFulfillManualOrder(orderId, deliveryContent, remark);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  };

  return (
    <Card className="border-blue-200 dark:border-blue-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageCheck className="h-5 w-5" />
          待人工发货
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          订单 {orderNo} 共 {quantity} 件，每行填写一条卡密或交付字符串。
        </p>
        <div className="space-y-2">
          <Label htmlFor="manual-delivery-content">卡密 / 发货内容</Label>
          <Textarea
            id="manual-delivery-content"
            value={deliveryContent}
            onChange={(event) => setDeliveryContent(event.target.value)}
            placeholder={quantity > 1 ? `每行一条，共 ${quantity} 行` : "输入卡密或交付字符串"}
            rows={Math.min(12, Math.max(5, quantity + 2))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="manual-delivery-remark">管理员备注（可选）</Label>
          <Textarea
            id="manual-delivery-remark"
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder="仅后台可见"
            rows={2}
          />
        </div>
        <Button className="w-full" disabled={isPending || !deliveryContent.trim()} onClick={submit}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          确认发货
        </Button>
      </CardContent>
    </Card>
  );
}

