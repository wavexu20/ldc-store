"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getUserOrders, requestRefund, getRefundEnabled } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Package,
  Copy,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  RotateCcw,
  Ban,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { formatShortTime } from "@/lib/time";
import { useI18n } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n";
import { getLocalizedFulfillmentLabel, type FulfillmentMode } from "@/lib/fulfillment";

interface OrderData {
  orderNo: string;
  productName: string;
  quantity: number;
  totalAmount: string;
  status: string;
  paymentMethod: string;
  createdAt: Date;
  paidAt: Date | null;
  cards: string[];
  deliveryLocked?: boolean;
  fulfillmentMode: FulfillmentMode;
  deliveryDueAt: Date | null;
  fulfilledAt: Date | null;
}

const statusConfig: Record<
  string,
  { label: MessageKey; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; className?: string }
> = {
  pending: {
    label: "pending",
    variant: "outline",
    icon: <Clock className="h-3 w-3" />,
  },
  paid: {
    label: "paid",
    variant: "default",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  completed: {
    label: "completed",
    variant: "default",
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-success text-success-foreground hover:bg-success/90",
  },
  expired: {
    label: "expired",
    variant: "secondary",
    icon: <XCircle className="h-3 w-3" />,
  },
  refund_pending: {
    label: "refundPending",
    variant: "outline",
    icon: <RotateCcw className="h-3 w-3" />,
    className: "border-warning text-warning-foreground dark:text-warning",
  },
  refund_rejected: {
    label: "refundRejected",
    variant: "secondary",
    icon: <Ban className="h-3 w-3" />,
  },
  refunded: {
    label: "refunded",
    variant: "destructive",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export default function MyOrdersPage() {
  const { t, locale } = useI18n();
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderData[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [copiedCard, setCopiedCard] = useState<string | null>(null);
  
  // 退款相关状态
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundOrderNo, setRefundOrderNo] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [refundEnabled, setRefundEnabled] = useState(false);

  const user = session?.user as { id?: string } | undefined;
  const isLoggedIn = Boolean(user?.id);

  const loadOrders = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      // 并行获取订单和退款功能状态
      const [result, isRefundEnabled] = await Promise.all([
        getUserOrders(),
        getRefundEnabled(),
      ]);
      
      setRefundEnabled(isRefundEnabled);
      
      if (result.success) {
        setOrders(result.data as OrderData[]);
      } else {
        toast.error(result.message || t("orderFailed"));
      }
    } catch {
      toast.error(t("orderFailed"));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    if (sessionStatus === "loading") return;

    if (!isLoggedIn) {
      router.push("/");
      return;
    }

    loadOrders();
  }, [sessionStatus, isLoggedIn, router, loadOrders]);

  const copyToClipboard = async (text: string, cardId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCard(cardId);
      toast.success(t("copied"));
      setTimeout(() => setCopiedCard(null), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const copyAllCards = async (cards: string[]) => {
    try {
      await navigator.clipboard.writeText(cards.join("\n"));
      toast.success(`${t("copied")} ${cards.length}`);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openRefundDialog = (orderNo: string) => {
    setRefundOrderNo(orderNo);
    setRefundReason("");
    setRefundDialogOpen(true);
  };

  const handleRefundSubmit = () => {
    if (!refundOrderNo) return;
    
    startTransition(async () => {
      const result = await requestRefund(refundOrderNo, refundReason);
      if (result.success) {
        toast.success(result.message);
        setRefundDialogOpen(false);
        loadOrders(true);
      } else if (result.requiresSecondFactor) {
        router.push("/account/verify-2fa?callbackUrl=%2Forder%2Fmy");
      } else {
        toast.error(result.message);
      }
    });
  };

  if (sessionStatus === "loading" || isLoading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">{t("myOrders")}</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => loadOrders(true)}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Orders */}
      {orders && orders.length > 0 ? (
        <div className="divide-y border rounded-lg bg-card">
          {orders.map((order) => {
            const status = statusConfig[order.status] || statusConfig.pending;
            const isExpanded = expandedOrder === order.orderNo;
            const hasCards = order.cards && order.cards.length > 0;

            return (
              <div key={order.orderNo}>
                {/* Order Row */}
                <button
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.orderNo)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{order.productName}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{formatShortTime(order.createdAt)}</span>
                      <span>×{order.quantity}</span>
                      <span className="font-medium text-foreground">¥{order.totalAmount}</span>
                    </div>
                  </div>
                  <Badge variant={status.variant} className={`shrink-0 text-xs ${status.className || ""}`}>
                    {status.icon}
                    <span className="ml-1">{t(status.label)}</span>
                  </Badge>
                  <ChevronRight
                    className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t bg-muted/30">
                    <div className="py-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("orderNo")}</span>
                        <span className="font-mono text-xs">{order.orderNo}</span>
                      </div>
                      {order.paidAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("paidAt")}</span>
                          <span>{new Date(order.paidAt).toLocaleString("zh-CN")}</span>
                        </div>
                      )}
                    </div>

                    {(order.status === "paid" || order.status === "completed") && (
                      <div className="mt-2 flex justify-end">
                        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                          <Link
                            href={`/order/receipt/${order.orderNo}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ReceiptText className="h-3 w-3 mr-1" />
                            {t("paymentReceipt")}
                          </Link>
                        </Button>
                      </div>
                    )}

                    {/* Cards */}
                    {hasCards && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium flex items-center gap-1.5">
                            <Package className="h-4 w-4" />
                            {t("deliveryInfo")} ({order.cards.length})
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyAllCards(order.cards);
                            }}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            {t("copyAll")}
                          </Button>
                        </div>
                        <div className="space-y-1">
                          {order.cards.map((card, idx) => {
                            const cardId = `${order.orderNo}-${idx}`;
                            return (
                              <div
                                key={idx}
                                className="flex items-center gap-2 p-2 rounded bg-background border text-sm group"
                              >
                                <code className="flex-1 font-mono text-xs break-all select-all">
                                  {card}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(card, cardId);
                                  }}
                                >
                                  {copiedCard === cardId ? (
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {order.deliveryLocked && (
                      <div className="mt-3 flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-warning-foreground dark:text-warning"><ShieldCheck className="size-4 shrink-0" />卡密已受二次验证保护</div>
                        <Button asChild size="sm"><Link href="/account/verify-2fa?callbackUrl=%2Forder%2Fmy">验证后查看</Link></Button>
                      </div>
                    )}

                    {/* Pending Notice */}
                    {order.status === "pending" && (
                      <div className="mt-3 rounded bg-warning/10 p-2 text-xs text-warning-foreground dark:text-warning">
                        {t("orderPendingHint")}
                      </div>
                    )}
                    {order.status === "paid" && order.fulfillmentMode !== "auto" && (
                      <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                        {getLocalizedFulfillmentLabel(order.fulfillmentMode, locale)}
                        {order.deliveryDueAt ? ` · ${new Date(order.deliveryDueAt).toLocaleString()}` : ""}
                      </div>
                    )}

                    {/* Refund Button - 仅当退款功能启用时显示 */}
                    {refundEnabled && order.status === "completed" && (
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRefundDialog(order.orderNo);
                          }}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          {t("requestRefund")}
                        </Button>
                      </div>
                    )}

                    {/* Refund Pending Notice */}
                    {order.status === "refund_pending" && (
                      <div className="mt-3 rounded bg-warning/10 p-2 text-xs text-warning-foreground dark:text-warning">
                        {t("refundSubmitted")}
                      </div>
                    )}

                    {/* Refund Rejected Notice */}
                    {order.status === "refund_rejected" && (
                      <div className="mt-3 rounded bg-destructive/10 p-2 text-xs text-destructive">
                        {t("refundRejected")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 border rounded-lg bg-card">
          <Package className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-muted-foreground">{t("noOrders")}</p>
          <Button asChild variant="outline" className="mt-4" size="sm">
            <Link href="/">{t("backHome")}</Link>
          </Button>
        </div>
      )}

      {/* Refund Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("requestRefund")}</DialogTitle>
            <DialogDescription>
              {t("refundDialogHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="refund-reason">{t("refundReason")}</Label>
              <Textarea
                id="refund-reason"
                placeholder={t("refundReasonPlaceholder")}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRefundDialogOpen(false)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleRefundSubmit}
              disabled={isPending || refundReason.trim().length < 5}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("submitRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
