import type { Metadata } from "next";
import { Trophy } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

import { getCustomersSpendLeaderboard } from "@/lib/actions/customers";
import { getTranslator } from "@/lib/i18n-server";
import { Money } from "@/components/store/money";

// 强制动态渲染，避免构建时查询数据库
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("leaderboard") };
}

function formatAmount(value: string): string {
  const num = Number.parseFloat(value || "0");
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

/**
 * Get avatar ring/border styles based on rank
 * - 1st place: Gold
 * - 2nd place: Silver
 * - 3rd place: Bronze
 */
function getRankAvatarStyles(rank: number): string {
  switch (rank) {
    case 1:
      return "ring-2 ring-yellow-400 shadow-lg shadow-yellow-200/50 dark:shadow-yellow-900/30";
    case 2:
      return "ring-2 ring-slate-300 shadow-md shadow-slate-200/50 dark:shadow-slate-700/30";
    case 3:
      return "ring-2 ring-orange-400 shadow-sm shadow-orange-200/50 dark:shadow-orange-900/30";
    default:
      return "";
  }
}

export default async function CustomersLeaderboardPage() {
  const { t } = await getTranslator();
  const items = await getCustomersSpendLeaderboard({ limit: 50 });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t("leaderboard")}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("leaderboardDescription")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-5 w-5" />
            TOP 50
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">{t("rank")}</TableHead>
                    <TableHead>{t("customer")}</TableHead>
                    <TableHead className="text-right">{t("completedOrders")}</TableHead>
                    <TableHead className="text-right">{t("totalSpent")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row, index) => {
                    const rank = index + 1;
                    const badgeVariant =
                      rank === 1 ? "default" : rank <= 3 ? "secondary" : "outline";
                    const avatarStyles = getRankAvatarStyles(rank);

                    return (
                      <TableRow key={row.userId}>
                        <TableCell className="font-medium tabular-nums">
                          <div className="flex items-center gap-2">
                            <Badge variant={badgeVariant}>#{rank}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className={`h-8 w-8 ${avatarStyles}`}>
                              <AvatarImage
                                src={row.userImage || undefined}
                                alt={row.username || t("userAvatar")}
                              />
                              <AvatarFallback className="text-xs font-medium">
                                {row.username?.charAt(0).toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {row.username ? `@${row.username}` : "-"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.orderCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Money amount={formatAmount(row.totalSpent)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
              {t("noData")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
