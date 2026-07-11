"use client";

import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  Loader2,
  Package,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  bulkUpdateProductStatus,
  bulkDeleteProducts,
  type AdminProductListItem,
} from "@/lib/actions/products";

import { ProductActions } from "./product-actions";

function Checkbox({
  checked,
  onChange,
  inputRef,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={ariaLabel}
      disabled={disabled}
      className="h-4 w-4 rounded border-input bg-background accent-primary disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

function useProductsSelection(items: AdminProductListItem[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const pageIds = useMemo(() => items.map((i) => i.id), [items]);

  const selection = useMemo(() => {
    const selectedOnPage = pageIds.filter((id) => selectedIds.has(id));
    return {
      selectedCount: selectedIds.size,
      allOnPageSelected:
        pageIds.length > 0 && selectedOnPage.length === pageIds.length,
      someOnPageSelected:
        selectedOnPage.length > 0 && selectedOnPage.length < pageIds.length,
    };
  }, [pageIds, selectedIds]);

  const selectAllRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = selection.someOnPageSelected;
  }, [selection.someOnPageSelected]);

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of pageIds) next.add(id);
      } else {
        for (const id of pageIds) next.delete(id);
      }
      return next;
    });
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  return {
    selectedIds,
    selection,
    selectAllRef,
    toggleAllOnPage,
    toggleOne,
    clearSelection,
  };
}

function ProductsBulkActionBar({
  selectedCount,
  isPending,
  onActivate,
  onDeactivate,
  onDelete,
  onClearSelection,
}: {
  selectedCount: number;
  isPending: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        {selectedCount > 0 ? (
          <span>
            已选择{" "}
            <span className="font-medium text-foreground">{selectedCount}</span>{" "}
            项
          </span>
        ) : (
          <span>可勾选商品进行批量操作</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || selectedCount === 0}
          onClick={onActivate}
        >
          <Eye className="h-4 w-4" />
          批量上架
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || selectedCount === 0}
          onClick={onDeactivate}
        >
          <EyeOff className="h-4 w-4" />
          批量下架
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={isPending || selectedCount === 0}
          onClick={onDelete}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          批量删除
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || selectedCount === 0}
          onClick={onClearSelection}
        >
          清除选择
        </Button>
      </div>
    </div>
  );
}

function ProductsBulkDeleteDialog({
  open,
  onOpenChange,
  selectedCount,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  isPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认删除商品</DialogTitle>
          <DialogDescription>
            将删除 {selectedCount} 个商品及其关联的卡密。该操作不可恢复，请确认后继续。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductsTableView({
  items,
  selectedIds,
  selectAllRef,
  allOnPageSelected,
  onToggleAllOnPage,
  onToggleOne,
}: {
  items: AdminProductListItem[];
  selectedIds: Set<string>;
  selectAllRef: RefObject<HTMLInputElement | null>;
  allOnPageSelected: boolean;
  onToggleAllOnPage: (checked: boolean) => void;
  onToggleOne: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[36px]">
              <Checkbox
                inputRef={selectAllRef}
                checked={allOnPageSelected}
                onChange={onToggleAllOnPage}
                ariaLabel="全选当前页"
              />
            </TableHead>
            <TableHead>商品信息</TableHead>
            <TableHead className="hidden md:table-cell">分类</TableHead>
            <TableHead className="text-right">价格</TableHead>
            <TableHead className="text-center">库存/销量</TableHead>
            <TableHead className="text-center">状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((product) => (
            <TableRow key={product.id}>
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(product.id)}
                  onChange={(checked) => onToggleOne(product.id, checked)}
                  ariaLabel={`选择商品 ${product.name}`}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                    {product.coverImage ? (
                      <img
                        src={product.coverImage}
                        alt={product.name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <Package className="h-5 w-5 text-zinc-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="font-medium text-zinc-900 dark:text-zinc-50 hover:underline truncate block max-w-[200px]"
                    >
                      {product.name}
                    </Link>
                    <p className="text-xs text-zinc-500 truncate max-w-[200px]">
                      {product.slug}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {product.categoryName ? (
                  <Badge variant="secondary">{product.categoryName}</Badge>
                ) : (
                  <span className="text-zinc-400">-</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-col items-end">
                  <span className="font-medium">¥{product.price}</span>
                  {product.originalPrice && (
                    <span className="text-xs text-zinc-400 line-through">
                      ¥{product.originalPrice}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex flex-col items-center gap-1">
                  <Badge
                    variant={
                      product.stock === 0
                        ? "destructive"
                        : product.stock < 10
                        ? "secondary"
                        : "default"
                    }
                  >
                    {product.stock}
                  </Badge>
                  <span className="text-xs text-zinc-500">
                    已售 {product.salesCount}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                {product.isActive ? (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <Eye className="mr-1 h-3 w-3" />
                    上架
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <EyeOff className="mr-1 h-3 w-3" />
                    下架
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <ProductActions
                  productId={product.id}
                  productSlug={product.slug}
                  isActive={product.isActive}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ProductsTable({
  items,
}: {
  items: AdminProductListItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const {
    selectedIds,
    selection,
    selectAllRef,
    toggleAllOnPage,
    toggleOne,
    clearSelection,
  } = useProductsSelection(items);

  const handleBulkActivate = () => {
    if (selection.selectedCount === 0) return;

    startTransition(async () => {
      const result = await bulkUpdateProductStatus(
        Array.from(selectedIds),
        "activate"
      );
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      clearSelection();
      router.refresh();
    });
  };

  const handleBulkDeactivate = () => {
    if (selection.selectedCount === 0) return;

    startTransition(async () => {
      const result = await bulkUpdateProductStatus(
        Array.from(selectedIds),
        "deactivate"
      );
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      clearSelection();
      router.refresh();
    });
  };

  const openBulkDelete = () => {
    if (selection.selectedCount === 0) return;
    setBulkDeleteOpen(true);
  };

  const confirmBulkDelete = () => {
    if (selection.selectedCount === 0) {
      setBulkDeleteOpen(false);
      return;
    }

    startTransition(async () => {
      const result = await bulkDeleteProducts(Array.from(selectedIds));
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setBulkDeleteOpen(false);
      clearSelection();
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <ProductsBulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        selectedCount={selection.selectedCount}
        isPending={isPending}
        onConfirm={confirmBulkDelete}
      />

      <ProductsBulkActionBar
        selectedCount={selection.selectedCount}
        isPending={isPending}
        onActivate={handleBulkActivate}
        onDeactivate={handleBulkDeactivate}
        onDelete={openBulkDelete}
        onClearSelection={clearSelection}
      />

      <ProductsTableView
        items={items}
        selectedIds={selectedIds}
        selectAllRef={selectAllRef}
        allOnPageSelected={selection.allOnPageSelected}
        onToggleAllOnPage={toggleAllOnPage}
        onToggleOne={toggleOne}
      />
    </div>
  );
}
