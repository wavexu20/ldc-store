"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productSchema, type ProductInput } from "@/lib/validations/product";
import { localeMeta, locales } from "@/lib/i18n";
import { type AdminCategoryOption } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Package, Save, Copy, Languages } from "lucide-react";
import Link from "next/link";

interface ProductFormProps {
  initialData?: Partial<ProductInput>;
  categories: AdminCategoryOption[];
  onSubmit: (values: ProductInput) => Promise<{ success: boolean; message?: string }>;
  isEdit?: boolean;
  templateInfo?: { name: string } | null;
}

const defaultValues: ProductInput = {
  name: "",
  slug: "",
  categoryId: null,
  description: "",
  content: "",
  price: 0,
  originalPrice: undefined,
  coverImage: "",
  isActive: true,
  isFeatured: false,
  sortOrder: 0,
  minQuantity: 1,
  maxQuantity: 10,
  autoTranslate: true,
  translationSourceLocale: "zh",
};

export function ProductForm({
  initialData,
  categories,
  onSubmit,
  isEdit = false,
  templateInfo = null,
}: ProductFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: { ...defaultValues, ...initialData },
  });

  const watchName = form.watch("name");
  const generateSlug = () => {
    const slug = watchName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    form.setValue("slug", slug || `product-${Date.now()}`);
  };

  const handleSubmit = (values: ProductInput) => {
    startTransition(async () => {
      const result = await onSubmit(values);

      if (result.success) {
        toast.success(result.message || (isEdit ? "商品更新成功" : "商品创建成功"));
        router.push("/admin/products");
      } else {
        toast.error(result.message);
      }
    });
  };

  const pageTitle = templateInfo ? "复制商品" : isEdit ? "编辑商品" : "添加商品";
  const pageDescription = templateInfo
    ? `基于「${templateInfo.name}」创建新商品`
    : isEdit
    ? "修改商品信息"
    : "创建新的商品信息";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/products">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {pageTitle}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">{pageDescription}</p>
        </div>
      </div>

      {templateInfo && (
        <Alert>
          <Copy className="h-4 w-4" />
          <AlertTitle>基于模板创建</AlertTitle>
          <AlertDescription>
            正在基于「{templateInfo.name}」创建新商品，已自动填充相关信息。商品默认为下架状态，请确认信息后手动上架。
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package className="h-5 w-5" />
                    基本信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>商品名称 *</FormLabel>
                        <FormControl>
                          <Input placeholder="输入商品名称" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL 标识 *</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input placeholder="product-url" {...field} />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={generateSlug}
                          >
                            自动生成
                          </Button>
                        </div>
                        <FormDescription>
                          商品页面 URL: /product/{field.value || "xxx"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>商品分类</FormLabel>
                        <FormControl>
                          <select
                            aria-label="商品分类"
                            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={field.value ?? "none"}
                            onChange={(event) =>
                              field.onChange(
                                event.target.value === "none"
                                  ? null
                                  : event.target.value
                              )
                            }
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          >
                            <option value="none">未分类</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                                {!category.isActive ? "（已隐藏）" : ""}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormDescription>
                          用于前台筛选与商品展示（可不选）
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>简短描述</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="商品简介，显示在列表页"
                            rows={2}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>详细描述 (Markdown)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="支持 Markdown 格式的详细商品介绍"
                            rows={6}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                    <FormField
                      control={form.control}
                      name="autoTranslate"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4">
                          <div className="space-y-1">
                            <FormLabel className="flex items-center gap-2 text-base">
                              <Languages className="h-4 w-4" />
                              {isEdit ? "重新生成多语言描述" : "自动生成多语言描述"}
                            </FormLabel>
                            <FormDescription>
                              使用 Cloudflare Workers AI 翻译名称、简介和详细描述；关闭后仅保存原文。
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              aria-label={isEdit ? "重新生成多语言描述" : "自动生成多语言描述"}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {form.watch("autoTranslate") && (
                      <FormField
                        control={form.control}
                        name="translationSourceLocale"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>原文语言</FormLabel>
                            <FormControl>
                              <select
                                aria-label="商品原文语言"
                                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                                {...field}
                              >
                                {locales.map((locale) => (
                                  <option key={locale} value={locale}>
                                    {localeMeta[locale].name}
                                  </option>
                                ))}
                              </select>
                            </FormControl>
                            <FormDescription>
                              保存时会生成其余 {locales.length - 1} 种语言；详细描述中的 Markdown 代码块保持原样。
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">价格设置</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>售价 *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step={0.01}
                              min={0.01}
                              placeholder="0"
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  Number.isFinite(e.target.valueAsNumber)
                                    ? e.target.valueAsNumber
                                    : 0
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="originalPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>原价（划线价）</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step={0.01}
                              min={0.01}
                              placeholder="0"
                              value={field.value || ""}
                              onChange={(e) => {
                                const val = e.target.valueAsNumber;
                                field.onChange(Number.isFinite(val) ? val : undefined);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="minQuantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>最小购买数量</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value) || 1)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="maxQuantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>最大购买数量</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value) || 10)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormDescription>原价留空则不显示折扣</FormDescription>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">商品图片</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="coverImage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>封面图片 URL</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://example.com/image.jpg"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormDescription>支持外部图片链接</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">发布设置</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <FormLabel className="text-base">
                            {isEdit ? "上架状态" : "立即上架"}
                          </FormLabel>
                          <FormDescription>
                            开启后商品将在前台显示
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isFeatured"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <FormLabel className="text-base">推荐商品</FormLabel>
                          <FormDescription>
                            在首页热门推荐区展示
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sortOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>排序权重</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value) || 0)
                            }
                          />
                        </FormControl>
                        <FormDescription>数字越小排序越靠前</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Button
                type="submit"
                className="w-full gap-2"
                size="lg"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {form.watch("autoTranslate")
                      ? isEdit
                        ? "保存并翻译中..."
                        : "创建并翻译中..."
                      : isEdit
                        ? "保存中..."
                        : "创建中..."}
                  </>
                ) : (
                  <>
                    {isEdit && <Save className="h-4 w-4" />}
                    {isEdit ? "保存修改" : "创建商品"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
