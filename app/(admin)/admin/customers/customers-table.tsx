"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LocalTime } from "@/components/time/local-time";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

import type { AdminCustomerListItem } from "@/lib/actions/admin-customers";

function formatAmount(value: string): string {
  const num = Number.parseFloat(value || "0");
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function buildAdminOrdersHrefByUserId(userId: string): string {
  const params = new URLSearchParams();
  params.set("q", userId);
  return `/admin/orders?${params.toString()}`;
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

export function CustomersTable({
  items,
  startRank,
}: {
  items: AdminCustomerListItem[];
  startRank: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">排名</TableHead>
            <TableHead>顾客</TableHead>
            <TableHead className="hidden md:table-cell">用户ID</TableHead>
            <TableHead className="text-right">完成订单</TableHead>
            <TableHead className="text-right">累计消费</TableHead>
            <TableHead className="hidden lg:table-cell">首次消费</TableHead>
            <TableHead className="hidden lg:table-cell">最近消费</TableHead>
            <TableHead className="w-24 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row, index) => {
            const rank = startRank + index;
            const avatarStyles = getRankAvatarStyles(rank);
            return (
              <TableRow key={row.userId}>
                <TableCell className="font-medium tabular-nums">{rank}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className={`h-8 w-8 ${avatarStyles}`}>
                      <AvatarImage
                        src={row.userImage || undefined}
                        alt={row.username || "用户头像"}
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
                <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                  {row.userId}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.orderCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ¥{formatAmount(row.totalSpent)}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <LocalTime value={row.firstPaidAt} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <LocalTime value={row.lastPaidAt} />
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm" className="gap-2">
                    <Link href={buildAdminOrdersHrefByUserId(row.userId)}>
                      <ExternalLink className="h-4 w-4" />
                      订单
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
