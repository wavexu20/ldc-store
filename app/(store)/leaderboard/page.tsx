import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Package, Trophy } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import { getActiveProducts } from "@/lib/actions/products";
import { getTranslator } from "@/lib/i18n-server";
import { Money } from "@/components/store/money";
import { localizeProducts } from "@/lib/product-i18n";

// 强制动态渲染，避免构建时查询数据库
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("leaderboard") };
}

export default async function BestSellersPage() {
  const { locale, t } = await getTranslator();
  const items = localizeProducts(
    await getActiveProducts({ limit: 50, sort: "sales_desc" }),
    locale
  );

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
                    <TableHead>{t("product")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("category")}</TableHead>
                    <TableHead className="text-right">{t("sales")}</TableHead>
                    <TableHead className="text-right">{t("amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((product, index) => {
                    const rank = index + 1;
                    const badgeVariant =
                      rank === 1 ? "default" : rank <= 3 ? "secondary" : "outline";

                    return (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium tabular-nums">
                          <div className="flex items-center gap-2">
                            <Badge variant={badgeVariant}>#{rank}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/product/${product.slug}`}
                            className="group flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                              {product.coverImage ? (
                                <Image
                                  src={product.coverImage}
                                  alt=""
                                  fill
                                  sizes="64px"
                                  className="object-cover"
                                  unoptimized={product.coverImage.startsWith("/api/product-images/")}
                                />
                              ) : (
                                <Package className="absolute inset-0 m-auto size-5 text-muted-foreground" />
                              )}
                            </div>
                            <span className="line-clamp-2 font-medium group-hover:underline">
                              {product.name}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {product.category?.name ?? "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {product.salesCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Money amount={product.price} />
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
