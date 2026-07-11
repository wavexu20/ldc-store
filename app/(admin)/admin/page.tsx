export const dynamic = "force-dynamic";

import { db, orders, cards, products } from "@/lib/db";
import { eq, sql, and, gte, lt } from "drizzle-orm";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  ShoppingCart,
  Package,
  AlertTriangle,
  TrendingUp,
  Clock,
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Megaphone,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getStatsTimeZone, getTodayRangeSql } from "@/lib/time/stats";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { getSystemSettings } from "@/lib/actions/system-settings";

const LOW_STOCK_THRESHOLD = 10;
const LAST_N_DAYS = 7;

type TrendDirection = "up" | "down" | "flat";

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function getTrend(current: number, previous: number): {
  direction: TrendDirection;
  percentText: string;
} {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { direction: "flat", percentText: "—" };
  }
  if (previous === 0) {
    if (current === 0) return { direction: "flat", percentText: "0%" };
    // 为什么这样做：当对比基数为 0 时，百分比会失真；这里用 +100% 作为“有增长”的占位提示。
    return { direction: "up", percentText: "+100%" };
  }
  const delta = ((current - previous) / previous) * 100;
  const direction: TrendDirection =
    Math.abs(delta) < 0.05 ? "flat" : delta > 0 ? "up" : "down";
  return { direction, percentText: formatPercent(delta) };
}

function formatDateTimeInTimeZone(date: Date, timeZone: string): string {
  // 为什么这样做：统一按统计口径时区展示时间，避免“服务器时区/浏览器时区”造成的后台对账困扰。
  const dtf = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return dtf.format(date);
}

function MiniBarChart(props: {
  rows: Array<{ label: string; value: number }>;
  highlightIndex?: number;
  ariaLabel?: string;
}) {
  const { rows, highlightIndex, ariaLabel } = props;
  const max = rows.reduce((acc, row) => Math.max(acc, row.value), 0);

  return (
    <div className="w-full" aria-label={ariaLabel} role="img">
      <div className="flex h-20 items-end gap-1.5">
        {rows.map((row, index) => {
          const percent = max > 0 ? (row.value / max) * 100 : 0;
          const isHighlight = highlightIndex === index;
          return (
            <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="relative h-16 w-full">
                <div
                  className="absolute bottom-0 w-full rounded-md bg-zinc-200/70 dark:bg-zinc-800/70"
                  style={{ height: `${Math.max(6, percent)}%` }}
                  title={`${row.label}: ${row.value.toFixed(2)}`}
                />
                {isHighlight ? (
                  <div
                    className="absolute bottom-0 w-full rounded-md bg-emerald-500/70"
                    style={{ height: `${Math.max(6, percent)}%` }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <span className="text-[10px] text-muted-foreground">{row.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function getDashboardStats() {
  // 今日销售统计（统计口径由 STATS_TIMEZONE 控制，默认 Asia/Shanghai）
  const statsTimeZone = getStatsTimeZone();
  const { start: todayStart, end: tomorrowStart } = getTodayRangeSql(statsTimeZone);

  const { orderExpireMinutes } = await getSystemSettings();

  const [
    todaySales,
    pendingOrders,
    refundPendingOrders,
    totalProducts,
    totalStock,
    lowStockProducts,
    recentOrders,
    salesLastNDays,
  ] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`,
        total: sql<string>`printf('%.2f', COALESCE(sum(CAST(total_amount AS REAL)), 0))`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, "completed"),
          gte(orders.paidAt, todayStart),
          lt(orders.paidAt, tomorrowStart)
        )
      ),
    // 待支付订单
    db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.status, "pending")),
    // 待退款订单
    db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.status, "refund_pending")),
    // 总商品数（上架中）
    db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.isActive, true)),
    // 总可用库存
    db
      .select({ count: sql<number>`count(*)` })
      .from(cards)
      .where(eq(cards.status, "available")),
    // 库存预警（可用库存少于阈值的商品）
    db.all(sql`
      SELECT p.id, p.name, COUNT(c.id) as stock
      FROM products p
      LEFT JOIN cards c ON c.product_id = p.id AND c.status = 'available'
      WHERE p.is_active = true
      GROUP BY p.id, p.name
      HAVING COUNT(c.id) < ${LOW_STOCK_THRESHOLD}
      ORDER BY COUNT(c.id) ASC
      LIMIT 6
    `),
    // 最近订单（用于运营快速回看）
    db.query.orders.findMany({
      columns: {
        id: true,
        orderNo: true,
        productName: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        paidAt: true,
      },
      orderBy: (o, { desc }) => [desc(o.createdAt)],
      limit: 8,
    }),
    db.query.orders.findMany({
      where: and(
        eq(orders.status, "completed"),
        gte(
          orders.paidAt,
          new Date(todayStart.getTime() - LAST_N_DAYS * 24 * 60 * 60 * 1000)
        )
      ),
      columns: { paidAt: true, totalAmount: true },
    }),
  ]);

  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: statsTimeZone,
    month: "2-digit",
    day: "2-digit",
  });
  const labelFor = (date: Date) => dayFormatter.format(date).replace("/", "-");
  const labels = Array.from({ length: LAST_N_DAYS }, (_, index) =>
    labelFor(new Date(Date.now() - (LAST_N_DAYS - 1 - index) * 24 * 60 * 60 * 1000))
  );
  const salesByDay = new Map<string, { count: number; total: number }>();
  for (const order of salesLastNDays) {
    if (!order.paidAt) continue;
    const label = labelFor(order.paidAt);
    const current = salesByDay.get(label) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += Number.parseFloat(order.totalAmount);
    salesByDay.set(label, current);
  }
  const salesRows = labels.map((day) => ({
    day,
    count: salesByDay.get(day)?.count ?? 0,
    total: (salesByDay.get(day)?.total ?? 0).toFixed(2),
  }));

  const todayTotal = Number.parseFloat(todaySales[0]?.total || "0");
  const yesterdayTotal =
    salesRows.length >= 2
      ? Number.parseFloat(salesRows[salesRows.length - 2]?.total || "0")
      : 0;
  const todayTrend = getTrend(todayTotal, yesterdayTotal);

  return {
    statsTimeZone,
    orderExpireMinutes,
    todaySales: {
      count: todaySales[0]?.count || 0,
      total: parseFloat(todaySales[0]?.total || "0").toFixed(2),
    },
    pendingOrderCount: pendingOrders[0]?.count || 0,
    refundPendingCount: refundPendingOrders[0]?.count || 0,
    lowStockProducts:
      (lowStockProducts as unknown as Array<{
        id: string;
        name: string;
        stock: number;
      }>) || [],
    recentOrders,
    totalProducts: totalProducts[0]?.count || 0,
    totalStock: totalStock[0]?.count || 0,
    salesLastNDays: salesRows,
    todayTrend,
  };
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: {
    label: "待支付",
    variant: "outline",
  },
  paid: {
    label: "已支付",
    variant: "secondary",
  },
  completed: {
    label: "已完成",
    variant: "default",
  },
  expired: {
    label: "已过期",
    variant: "secondary",
  },
  refund_pending: {
    label: "待退款",
    variant: "destructive",
  },
  refund_rejected: {
    label: "退款已拒绝",
    variant: "outline",
  },
  refunded: {
    label: "已退款",
    variant: "destructive",
  },
};

export default async function AdminDashboard() {
  const stats = await getDashboardStats();
  const series = stats.salesLastNDays.map((row) => ({
    label: row.day,
    value: Number.parseFloat(row.total || "0"),
  }));
  const todaySeriesIndex = Math.max(0, series.length - 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
          <p className="text-muted-foreground">
            面向运营的快速概览（统计口径：{stats.statsTimeZone}）
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="secondary" className="gap-1">
              <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              系统正常
            </Badge>
            <Badge variant="secondary">
              订单过期：{stats.orderExpireMinutes} 分钟
            </Badge>
            <Badge variant="secondary">
              库存预警：&lt; {LOW_STOCK_THRESHOLD}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" className="gap-2">
            <Link href="/admin/products/new">
              <Plus className="h-4 w-4" />
              添加商品
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/admin/cards">
              <CreditCard className="h-4 w-4" />
              卡密
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/admin/orders">
              <ShoppingCart className="h-4 w-4" />
              订单
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/admin/announcements">
              <Megaphone className="h-4 w-4" />
              公告
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/admin/settings">
              <Activity className="h-4 w-4" />
              系统状态
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* KPI */}
        <Card className="py-4 lg:col-span-3">
          <CardContent className="px-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/40">
                <DollarSign className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-semibold leading-none text-zinc-900 dark:text-zinc-50">
                  ¥{stats.todaySales.total}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  {stats.todayTrend.direction === "up" ? (
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      {stats.todayTrend.percentText}
                    </span>
                  ) : stats.todayTrend.direction === "down" ? (
                    <span className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
                      <ArrowDownRight className="h-3.5 w-3.5" />
                      {stats.todayTrend.percentText}
                    </span>
                  ) : (
                    <span className="font-medium text-muted-foreground">
                      {stats.todayTrend.percentText}
                    </span>
                  )}
                  <span className="text-muted-foreground">对比昨日</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="py-4 lg:col-span-3">
          <CardContent className="px-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950/40">
                <ShoppingCart className="h-4 w-4 text-violet-700 dark:text-violet-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-semibold leading-none text-zinc-900 dark:text-zinc-50">
                  {stats.todaySales.count}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  今日完成订单
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="py-4 lg:col-span-3">
          <CardContent className="px-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/40">
                <Clock className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-semibold leading-none text-zinc-900 dark:text-zinc-50">
                  {stats.pendingOrderCount}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  待支付订单
                </p>
              </div>
              <div className="ml-auto">
                <Button asChild size="sm" variant="ghost">
                  <Link href="/admin/orders?status=pending">查看</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="py-4 lg:col-span-3">
          <CardContent className="px-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-950/40">
                <AlertTriangle className="h-4 w-4 text-rose-700 dark:text-rose-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-semibold leading-none text-zinc-900 dark:text-zinc-50">
                  {stats.refundPendingCount}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  待退款审核
                </p>
              </div>
              <div className="ml-auto">
                <Button asChild size="sm" variant="ghost">
                  <Link href="/admin/orders?status=refund_pending">处理</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Overview */}
        <Card className="lg:col-span-8">
          <CardHeader>
            <div className="space-y-1">
              <CardTitle className="text-base">销售趋势</CardTitle>
              <CardDescription>
                最近 {LAST_N_DAYS} 天（{stats.statsTimeZone}）
              </CardDescription>
            </div>
            <CardAction>
              <Button asChild size="sm" variant="outline" className="gap-2">
                <Link href="/admin/orders">
                  <TrendingUp className="h-4 w-4" />
                  查看订单
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">今日销售额</div>
                <div className="text-3xl font-semibold tracking-tight">
                  {stats.todaySales.total}
                  <span className="ml-1 text-base text-muted-foreground">CNY</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  今日完成订单：{stats.todaySales.count}
                </div>
                <div className="text-xs text-muted-foreground">
                  可用库存：{stats.totalStock} · 在售商品：{stats.totalProducts}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <MiniBarChart
                  ariaLabel={`最近 ${LAST_N_DAYS} 天销售额柱状图`}
                  rows={series}
                  highlightIndex={todaySeriesIndex}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ops / Quick Links */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <div className="space-y-1">
              <CardTitle className="text-base">运营待办</CardTitle>
              <CardDescription>优先处理影响交付与售后</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href="/admin/orders?status=pending"
              className="group flex items-center justify-between rounded-xl border bg-muted/20 p-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/40">
                  <Clock className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">待支付</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.pendingOrderCount} 笔订单等待支付
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            </Link>

            <Link
              href="/admin/orders?status=refund_pending"
              className="group flex items-center justify-between rounded-xl border bg-muted/20 p-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-950/40">
                  <AlertTriangle className="h-4 w-4 text-rose-700 dark:text-rose-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">退款审核</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.refundPendingCount} 笔退款待处理
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            </Link>

            <Link
              href="/admin/cards"
              className="group flex items-center justify-between rounded-xl border bg-muted/20 p-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900/40">
                  <Package className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">库存巡检</p>
                  <p className="text-xs text-muted-foreground">
                    查看锁定/可用/售出卡密
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            </Link>
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">最近订单</CardTitle>
              <CardDescription>点击进入详情查看卡密/退款</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin/orders">查看全部</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.recentOrders.length > 0 ? (
              <Table>
                <TableBody>
                  {stats.recentOrders.map((order) => {
                    const status =
                      statusConfig[order.status] || statusConfig.pending;
                    const createdAt = formatDateTimeInTimeZone(
                      order.createdAt,
                      stats.statsTimeZone
                    );
                    return (
                      <TableRow key={order.id} className="cursor-pointer">
                        <TableCell className="w-[1%] pr-2">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="min-w-0">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="block min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-md px-1 py-1 -mx-1"
                          >
                            <p className="truncate text-sm font-medium">
                              {order.productName}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {order.orderNo} · ¥{order.totalAmount} · {createdAt}
                            </p>
                          </Link>
                        </TableCell>
                        <TableCell className="w-[1%] text-right text-xs text-muted-foreground">
                          <ArrowUpRight className="h-4 w-4" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ShoppingCart className="h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">暂无订单</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock */}
        <Card className="lg:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">库存预警</CardTitle>
              <CardDescription>
                可用库存少于 {LOW_STOCK_THRESHOLD} 的商品
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin/cards">管理卡密</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.lowStockProducts.length > 0 ? (
              <div className="space-y-3">
                {stats.lowStockProducts.map((product) => {
                  const ratio = Math.min(
                    1,
                    Math.max(0, product.stock / LOW_STOCK_THRESHOLD)
                  );
                  return (
                    <Link
                      key={product.id}
                      href={`/admin/cards?product=${product.id}`}
                      className="group block rounded-xl border bg-muted/20 p-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {product.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            可用库存：{product.stock}
                          </p>
                        </div>
                        <Badge
                          variant={product.stock === 0 ? "destructive" : "secondary"}
                          className="shrink-0"
                        >
                          {product.stock === 0 ? "缺货" : "偏低"}
                        </Badge>
                      </div>
                      <div className="mt-3 h-1.5 w-full rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-amber-500 transition-[width]"
                          style={{ width: `${Math.max(6, ratio * 100)}%` }}
                          aria-hidden="true"
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Package className="h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  所有商品库存充足
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
