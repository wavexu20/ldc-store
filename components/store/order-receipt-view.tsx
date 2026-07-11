"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { CheckCircle2, Copy, FileDown, Link2, ReceiptText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatLocalTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export type OrderReceiptViewData = {
  orderNo: string;
  productName: string;
  totalAmount: string;
  paidAt: Date | string | null;
  username: string | null;
};

function PosterField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[84px_1fr] items-start gap-4">
      <div className="pt-0.5 text-[11px] font-medium text-slate-600">
        {label}
      </div>
      <div
        className={cn(
          "min-w-0 text-right text-sm text-slate-900 break-all",
          mono ? "font-mono text-xs tabular-nums" : "font-medium"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function OrderReceiptView({
  receipt,
  merchantName,
}: {
  receipt: OrderReceiptViewData;
  merchantName?: string;
}) {
  const posterRef = useRef<HTMLDivElement | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const resolvedMerchantName = useMemo(() => {
    const normalized = merchantName?.trim();
    if (normalized) return normalized;
    return process.env.NEXT_PUBLIC_SITE_NAME || "LDC Store";
  }, [merchantName]);

  const paidAtText = receipt.paidAt ? formatLocalTime(receipt.paidAt) : "—";
  const username = receipt.username?.trim() ? receipt.username.trim() : "—";

  useEffect(() => {
    // 为什么这样做：确保服务端渲染与首屏 hydration 输出一致，避免因为 window 访问导致的 hydration mismatch。
    setShareUrl(
      `${window.location.origin}/order/receipt/${encodeURIComponent(
        receipt.orderNo
      )}`
    );
  }, [receipt.orderNo]);

  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("已复制分享链接");
    } catch {
      toast.error("复制失败，请手动复制地址栏链接");
    }
  };

  const copyReceiptText = async () => {
    const text = [
      `${resolvedMerchantName} - 支付成功凭证`,
      `订单号：${receipt.orderNo}`,
      `商品：${receipt.productName}`,
      `金额：¥${receipt.totalAmount}`,
      `支付时间：${paidAtText}`,
      `用户名：${username}`,
      shareUrl ? `链接：${shareUrl}` : undefined,
    ]
      .filter((line): line is string => typeof line === "string")
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制凭证文本");
    } catch {
      toast.error("复制失败，请手动选择复制");
    }
  };

  const downloadPoster = async () => {
    if (!posterRef.current) return;

    setIsDownloading(true);
    try {
      // 为什么这样做：
      // - 海报是“对外发送”的内容，强制白底能避免深色模式截图/导出后可读性变差
      // - 提升 pixelRatio 可减少文字锯齿，便于客服核验
      const dataUrl = await toPng(posterRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const link = document.createElement("a");
      link.download = `payment-receipt_${receipt.orderNo}.png`;
      link.href = dataUrl;
      link.click();

      toast.success("已开始下载海报");
    } catch (error) {
      console.error("downloadPoster failed:", error);
      toast.error("导出失败，请改用截图或复制链接");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-12">
      <Card className="overflow-hidden">
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-4 w-4 text-muted-foreground" />
                  <h1 className="text-lg font-semibold leading-tight">
                    {resolvedMerchantName}
                  </h1>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  支付成功凭证 · 用于客服核验/对外分享（不包含卡密）
                </p>
              </div>
            </div>
          </div>
            <Badge className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-600/90">
              已支付
            </Badge>
          </div>

          <div className="rounded-2xl border bg-muted/20 p-3">
            <div
              ref={posterRef}
              className="rounded-2xl bg-white p-6 text-slate-900 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-base font-semibold">{resolvedMerchantName}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    支付成功凭证 · Payment Receipt
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600/90">
                    Paid
                  </Badge>
                  <div className="text-[11px] text-slate-500">
                    No.{receipt.orderNo.slice(-8)}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5">
                <div className="text-[11px] font-medium text-slate-600">
                  支付金额
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <div className="min-w-0 text-3xl font-semibold tabular-nums">
                    {receipt.totalAmount}
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-slate-700">
                    CNY
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  {receipt.productName}
                </div>
              </div>

              <div className="my-5 border-t border-dashed border-slate-200" />

              <div className="space-y-3">
                <div className="text-[11px] font-medium text-slate-600">
                  核验信息
                </div>
                <div className="space-y-2">
                  <PosterField label="订单号" value={receipt.orderNo} mono />
                  <PosterField label="商品" value={receipt.productName} />
                  <PosterField
                    label="金额"
                    value={`¥${receipt.totalAmount}`}
                    mono
                  />
                  <PosterField label="支付时间" value={paidAtText} />
                  <PosterField label="用户名" value={username} mono />
                </div>
              </div>

              <div className="mt-5 text-[11px] leading-relaxed text-slate-500">
                提示：该凭证仅用于信息展示与便捷分享，最终核验以平台订单与后台记录为准。
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span className="truncate">
                分享前请确认信息无误（不包含卡密）
              </span>
              <span className="shrink-0 font-mono">
                {receipt.orderNo.slice(-6)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Button
              variant="outline"
              onClick={copyShareLink}
              disabled={!shareUrl}
              className="justify-center"
            >
              <Link2 className="mr-2 h-4 w-4" />
              复制链接
            </Button>
            <Button variant="outline" onClick={copyReceiptText} className="justify-center">
              <Copy className="mr-2 h-4 w-4" />
              复制文本
            </Button>
            <Button
              onClick={downloadPoster}
              disabled={isDownloading}
              className="justify-center"
            >
              <FileDown className="mr-2 h-4 w-4" />
              {isDownloading ? "导出中..." : "下载海报"}
            </Button>
          </div>

          <div className="flex gap-3">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/order/my">我的订单</Link>
            </Button>
            <Button asChild variant="ghost" className="flex-1">
              <Link href="/">首页</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
