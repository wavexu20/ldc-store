"use client";

import { useEffect, useState, useCallback, useRef, use, type ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getOrderByNo } from "@/lib/actions/orders";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Home,
  Copy,
  Package,
  ReceiptText,
  RefreshCw,
  XCircle,
  ShoppingBag,
  ShieldCheck,
} from "lucide-react";
import { formatLocalTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import { getLocalizedFulfillmentLabel, type FulfillmentMode } from "@/lib/fulfillment";

interface OrderResultPageProps {
  // Next.js 期望 searchParams 为 Promise 类型；运行时保留 isThenable 检查以兼容测试传入对象。
  searchParams?: Promise<{ out_trade_no?: string }>;
}

interface OrderData {
  orderNo: string;
  productName: string;
  quantity: number;
  totalAmount: string;
  status: string;
  createdAt: Date;
  paidAt: Date | null;
  cards: string[];
  deliveryLocked?: boolean;
  fulfillmentMode: FulfillmentMode;
  deliveryDueAt: Date | null;
  fulfilledAt: Date | null;
}

// 轮询配置
const POLL_INTERVAL = 2000; // 每 2 秒轮询一次
const MAX_POLL_COUNT = 15; // 最多轮询 15 次（共 30 秒）

function isThenable<T>(value: unknown): value is PromiseLike<T> {
  return typeof (value as { then?: unknown } | null)?.then === "function";
}

function CenteredStateCard({
  icon,
  title,
  description,
  actions,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-12">
      <Card className="overflow-hidden">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            {icon}
          </div>
          <div className="space-y-1">
            <div className="text-lg font-semibold">{title}</div>
            {description ? (
              <div className="text-sm text-muted-foreground">{description}</div>
            ) : null}
          </div>
          {actions ? <div className="pt-2">{actions}</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoItem({
  label,
  value,
  valueClassName,
  action,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="pt-0.5 text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2">
        <div className={cn("min-w-0 text-right text-sm text-foreground", valueClassName)}>
          {value}
        </div>
        {action}
      </div>
    </div>
  );
}

export default function OrderResultPage({ searchParams }: OrderResultPageProps) {
  const { t, locale } = useI18n();
  // 兼容 undefined、Promise、纯对象（测试环境）三种情况
  const resolvedParams = searchParams
    ? (isThenable<{ out_trade_no?: string }>(searchParams) ? use(searchParams) : searchParams)
    : {};
  const { data: session, status: sessionStatus } = useSession();
  const [orderNo, setOrderNo] = useState(resolvedParams.out_trade_no || "");

  const [order, setOrder] = useState<OrderData | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isOrderNoCopied, setIsOrderNoCopied] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // 轮询计数器
  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 检查是否是 Linux DO 登录用户
  const user = session?.user as { id?: string } | undefined;
  const isLoggedIn = Boolean(user?.id);

  // 如果 URL 没有订单号参数，尝试从 localStorage 读取
  useEffect(() => {
    if (!resolvedParams.out_trade_no) {
      const savedOrderNo = localStorage.getItem("ldc_last_order_no");
      if (savedOrderNo) {
        setOrderNo(savedOrderNo);
        localStorage.removeItem("ldc_last_order_no");
      }
    }
  }, [resolvedParams.out_trade_no]);

  // 清理轮询定时器
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  const loadOrder = useCallback(async (isPollingRequest = false) => {
    if (!orderNo) {
      setIsLoading(false);
      return;
    }

    try {
      const result = await getOrderByNo(orderNo);
      if (result.success && result.data) {
        const orderData = result.data as OrderData;
        setOrder(orderData);
        
        // 如果订单状态是 pending 且未超过最大轮询次数，继续轮询
        if (orderData.status === "pending" && pollCountRef.current < MAX_POLL_COUNT) {
          setIsPolling(true);
          pollCountRef.current++;
          pollTimerRef.current = setTimeout(() => {
            loadOrder(true);
          }, POLL_INTERVAL);
        } else {
          setIsPolling(false);
          // 如果订单状态已更新，显示提示
          if (isPollingRequest && (orderData.status === "paid" || orderData.status === "completed")) {
            toast.success(t("paymentSuccess"));
          }
        }
      } else {
        setError(result.message || t("orderUnavailable"));
        setIsPolling(false);
      }
    } catch {
      setError(t("orderUnavailable"));
      setIsPolling(false);
    } finally {
      setIsLoading(false);
    }
  }, [orderNo, t]);

  // 加载订单数据
  useEffect(() => {
    if (sessionStatus === "loading") return;
    
    if (!orderNo) {
      setIsLoading(false);
      return;
    }

    if (!isLoggedIn) {
      setError(t("loginRequired"));
      setIsLoading(false);
      return;
    }

    // 重置轮询计数器
    pollCountRef.current = 0;
    loadOrder();
  }, [sessionStatus, orderNo, isLoggedIn, loadOrder, t]);

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast.success(t("copied"));
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  // 加载中
  if (isLoading || sessionStatus === "loading") {
    return (
      <CenteredStateCard
        icon={<Loader2 className="h-6 w-6 animate-spin" />}
        title={t("loading")}
        description={t("fetchingOrder")}
      />
    );
  }

  // 未登录
  if (!isLoggedIn) {
    return (
      <CenteredStateCard
        icon={<XCircle className="h-6 w-6" />}
        title={t("loginRequired")}
        description={t("signInToViewOrder")}
        actions={
          <Button asChild>
            <Link href="/">{t("backHomePage")}</Link>
          </Button>
        }
      />
    );
  }

  // 订单号无效
  if (!orderNo) {
    return (
      <CenteredStateCard
        icon={<XCircle className="h-6 w-6" />}
        title={t("invalidOrderNo")}
        description={t("invalidOrderHint")}
        actions={
          <div className="flex justify-center gap-3">
            <Button asChild variant="outline">
              <Link href="/order/my">{t("myOrders")}</Link>
            </Button>
            <Button asChild>
              <Link href="/">{t("backHomePage")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  // 订单不存在或无权限
  if (error) {
    return (
      <CenteredStateCard
        icon={<XCircle className="h-6 w-6" />}
        title={t("orderUnavailable")}
        description={error}
        actions={
          <div className="flex justify-center gap-3">
            <Button asChild variant="outline">
              <Link href="/order/my">
                <ShoppingBag className="mr-2 h-4 w-4" />
                {t("myOrders")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/">{t("backHomePage")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  // 加载订单中
  if (!order) {
    return (
      <CenteredStateCard
        icon={<Loader2 className="h-6 w-6 animate-spin" />}
        title={t("loadingOrder")}
      />
    );
  }

  // 已查询 - 显示订单详情
  const isPaid = order.status === "paid" || order.status === "completed";
  const canShowReceipt = isPaid;
  const hasCards = Boolean(order.cards && order.cards.length > 0);

  const statusMeta = (() => {
    if (isPaid) {
      return {
        label: t(order.status === "completed" ? "completed" : "paid"),
        title: t("paymentSuccess"),
        description: t(hasCards ? "deliveryReady" : "deliveryPreparing"),
        icon: <CheckCircle2 className="h-5 w-5" />,
        iconClassName:
          "bg-success/10 text-success",
        badgeClassName:
          "bg-success text-success-foreground hover:bg-success/90",
      };
    }

    switch (order.status) {
      case "pending":
        return {
          label: t("pending"),
          title: t(isPolling ? "confirmingPayment" : "awaitingPayment"),
          description: isPolling
            ? t("autoUpdateHint")
            : t("manualRefreshHint"),
          icon: isPolling ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Clock className="h-5 w-5" />
          ),
          iconClassName:
            "bg-warning/10 text-warning-foreground dark:text-warning",
          badgeClassName:
            "bg-warning text-warning-foreground hover:bg-warning/90",
        };
      case "expired":
        return {
          label: t("expired"),
          title: t("orderExpired"),
          description: t("orderExpiredHint"),
          icon: <XCircle className="h-5 w-5" />,
          iconClassName: "bg-muted text-muted-foreground",
          badgeClassName: "bg-muted text-muted-foreground hover:bg-muted",
        };
      case "refund_pending":
        return {
          label: t("refundPending"),
          title: t("refundProcessing"),
          description: t("refundSubmitted"),
          icon: <Clock className="h-5 w-5" />,
          iconClassName:
            "bg-warning/10 text-warning-foreground dark:text-warning",
          badgeClassName:
            "bg-warning text-warning-foreground hover:bg-warning/90",
        };
      case "refund_rejected":
        return {
          label: t("refundRejected"),
          title: t("refundRejected"),
          description: t("refundRejectedHint"),
          icon: <XCircle className="h-5 w-5" />,
          iconClassName: "bg-muted text-muted-foreground",
          badgeClassName: "bg-muted text-muted-foreground hover:bg-muted",
        };
      case "refunded":
        return {
          label: t("refunded"),
          title: t("orderRefunded"),
          description: t("orderRefundedHint"),
          icon: <XCircle className="h-5 w-5" />,
          iconClassName: "bg-muted text-muted-foreground",
          badgeClassName: "bg-muted text-muted-foreground hover:bg-muted",
        };
      default:
        return {
          label: order.status,
          title: t("statusUpdating"),
          description: t("statusUpdatingHint"),
          icon: <Clock className="h-5 w-5" />,
          iconClassName: "bg-muted text-muted-foreground",
          badgeClassName: "bg-muted text-muted-foreground hover:bg-muted",
        };
    }
  })();

  const copyOrderNo = async () => {
    try {
      await navigator.clipboard.writeText(order.orderNo);
      setIsOrderNoCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setIsOrderNoCopied(false), 1500);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const copyAllCards = async () => {
    if (!hasCards) return;
    try {
      await navigator.clipboard.writeText(order.cards.join("\n"));
      toast.success(`${t("copied")} ${order.cards.length}`);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const refreshOrder = async () => {
    setIsRefreshing(true);

    // 为什么这样做：手动刷新通常意味着用户“刚支付完”，这里重置轮询并清理旧定时器，避免并发轮询导致状态闪烁。
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }
    pollCountRef.current = 0;

    await loadOrder(true);
    setIsRefreshing(false);
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-12">
      <Card className="overflow-hidden">
        <CardContent className="pt-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    statusMeta.iconClassName
                  )}
                >
                  {statusMeta.icon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-semibold leading-tight">
                      {statusMeta.title}
                    </h1>
                    <Badge className={statusMeta.badgeClassName}>
                      {statusMeta.label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm font-medium text-foreground truncate">
                    {order.productName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {statusMeta.description}
                  </p>
                </div>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={refreshOrder}
              disabled={isRefreshing}
              aria-label={t("refreshStatus")}
              title={t("refreshStatus")}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing ? "animate-spin" : "")} />
            </Button>
          </div>

          {/* Order Info */}
          <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">{t("orderInfo")}</div>
              <div className="text-[11px] text-muted-foreground">
                {t("savingOrderNo")}
              </div>
            </div>

            <div className="space-y-2">
              <InfoItem
                label={t("orderNo")}
                value={<code className="font-mono text-xs">{order.orderNo}</code>}
                valueClassName="max-w-[220px]"
                action={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={copyOrderNo}
                    aria-label={`${t("copy")} ${t("orderNo")}`}
                    title={`${t("copy")} ${t("orderNo")}`}
                  >
                    {isOrderNoCopied ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                }
              />
              <InfoItem
                label={t("amount")}
                value={
                  <span className="font-semibold tabular-nums">
                    ¥{order.totalAmount}
                  </span>
                }
              />
              <InfoItem label={t("quantity")} value={String(order.quantity)} />
              <InfoItem label={t("placedAt")} value={formatLocalTime(order.createdAt)} />
              {order.paidAt ? (
                <InfoItem label={t("paidAt")} value={formatLocalTime(order.paidAt)} />
              ) : null}
            </div>
          </div>

          {/* Cards / Secure Notice */}
          {isPaid ? (
            hasCards ? (
              <div className="rounded-2xl border border-success/25 bg-success/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-success">
                    <Package className="h-4 w-4" />
                    {t("deliveryInfo")}
                    <Badge variant="secondary" className="ml-1">
                      {order.cards.length}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={copyAllCards}
                    disabled={!hasCards}
                  >
                    <Copy className="mr-2 h-3 w-3" />
                    {t("copyAll")}
                  </Button>
                </div>

                <div className="mt-2 text-xs text-muted-foreground">
                  {t("sensitiveDeliveryHint")}
                </div>

                <div className="mt-3 space-y-2">
                  {order.cards.map((card, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white p-3 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900"
                    >
                      <code className="text-xs font-mono break-all flex-1 select-all">
                        {card}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => copyToClipboard(card, index)}
                        aria-label={`${t("copy")} ${t("deliveryInfo")}`}
                        title={`${t("copy")} ${t("deliveryInfo")}`}
                      >
                        {copiedIndex === index ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                <div>{t("preparingDeliveryHint")}</div>
                {order.fulfillmentMode !== "auto" ? (
                  <div className="mt-2 font-medium text-foreground">
                    {getLocalizedFulfillmentLabel(order.fulfillmentMode, locale)}
                    {order.deliveryDueAt ? ` · ${formatLocalTime(order.deliveryDueAt)}` : ""}
                  </div>
                ) : null}
              </div>
            )
          ) : null}

          {order.deliveryLocked ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 font-medium text-warning-foreground dark:text-warning"><ShieldCheck className="size-4 shrink-0" />卡密已受二次验证保护</div>
              <Button asChild size="sm"><Link href={`/account/verify-2fa?callbackUrl=${encodeURIComponent(`/order/result?out_trade_no=${order.orderNo}`)}`}>验证后查看</Link></Button>
            </div>
          ) : null}

          {/* Actions */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {canShowReceipt ? (
              <Button asChild className="justify-center">
                <Link href={`/order/receipt/${order.orderNo}`}>
                  <ReceiptText className="mr-2 h-4 w-4" />
                  {t("paymentReceipt")}
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={refreshOrder}
                disabled={isRefreshing}
                className="justify-center"
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing ? "animate-spin" : "")} />
                {t("refreshStatus")}
              </Button>
            )}
            <Button asChild variant="outline" className="justify-center">
              <Link href="/order/my">
                <ShoppingBag className="mr-2 h-4 w-4" />
                {t("myOrders")}
              </Link>
            </Button>
            <Button asChild variant="ghost" className="justify-center">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                {t("backHomePage")}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
