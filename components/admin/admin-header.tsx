"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/theme-toggle";

const routeNames: Record<string, string> = {
  "/admin": "仪表盘",
  "/admin/products": "商品管理",
  "/admin/products/new": "添加商品",
  "/admin/products/edit": "编辑商品",
  "/admin/categories": "分类管理",
  "/admin/cards": "卡密管理",
  "/admin/orders": "订单管理",
  "/admin/reviews": "评价管理",
  "/admin/settings": "系统状态",
  "/admin/system-config": "系统配置",
};

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: { href: string; label: string; isCurrentPage: boolean }[] =
    [];

  let currentPath = "";

  for (let i = 0; i < segments.length; i++) {
    currentPath += `/${segments[i]}`;
    const isCurrentPage = i === segments.length - 1;

    // 跳过动态路由段（如 [id]）
    if (segments[i].startsWith("[") && segments[i].endsWith("]")) {
      continue;
    }

    // 处理特殊情况：编辑页面
    if (segments[i] === "edit" && i > 0) {
      breadcrumbs.push({
        href: currentPath,
        label: "编辑",
        isCurrentPage,
      });
      continue;
    }

    // 检查是否为 UUID 或数字 ID
    const isId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        segments[i]
      ) || /^\d+$/.test(segments[i]);

    if (isId) {
      continue;
    }

    const label = routeNames[currentPath] || segments[i];
    breadcrumbs.push({
      href: currentPath,
      label,
      isCurrentPage,
    });
  }

  return breadcrumbs;
}

export function AdminHeader() {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.href}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {crumb.isCurrentPage ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
