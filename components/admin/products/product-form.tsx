"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productSchema, type ProductInput } from "@/lib/validations/product";
import { localeMeta, locales } from "@/lib/i18n";
import { type AdminCategoryOption } from "@/lib/actions/categories";
import { deleteProductImage, uploadProductImages } from "@/lib/actions/product-images";
import { createProductPreview } from "@/lib/actions/product-previews";
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
import { Loader2, ArrowLeft, Package, Save, Copy, Languages, Eye, ImagePlus, Link2, Trash2, Upload } from "lucide-react";
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
  images: [],
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
  const [isImagePending, startImageTransition] = useTransition();
  const [isPreviewPending, startPreviewTransition] = useTransition();
  const [externalImageUrl, setExternalImageUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const form = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: { ...defaultValues, ...initialData },
  });

  const watchName = form.watch("name");
  const images = form.watch("images") ?? [];
  const generateSlug = () => {
    const slug = watchName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    form.setValue("slug", slug || `product-${Date.now()}`);
  };

  const updateImages = (nextImages: string[]) => {
    const uniqueImages = Array.from(new Set(nextImages.filter(Boolean))).slice(0, 12);
    form.setValue("images", uniqueImages, { shouldDirty: true, shouldValidate: true });
    const currentCover = form.getValues("coverImage") || "";
    if (!currentCover || !uniqueImages.includes(currentCover)) {
      form.setValue("coverImage", uniqueImages[0] || "", { shouldDirty: true, shouldValidate: true });
    }
  };

  const addExternalImage = () => {
    const candidate = externalImageUrl.trim();
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      updateImages([...images, url.toString()]);
      setExternalImageUrl("");
    } catch {
      toast.error("请输入有效的图片链接");
    }
  };

  const uploadImages = (files: FileList | null) => {
    if (!files?.length) return;
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("images", file));
    startImageTransition(async () => {
      const result = await uploadProductImages(formData);
      if (!result.success || !result.urls) {
        toast.error(result.message);
        return;
      }
      updateImages([...images, ...result.urls]);
      toast.success(result.message);
    });
  };

  const removeImage = (url: string) => {
    const nextImages = images.filter((image) => image !== url);
    updateImages(nextImages);
    startImageTransition(async () => {
      const result = await deleteProductImage(url);
      if (!result.success) toast.error(result.message);
    });
  };

  const createPreview = () => {
    startPreviewTransition(async () => {
      const result = await createProductPreview(form.getValues());
      if (!result.success || !result.url) {
        toast.error(result.message);
        return;
      }
      setPreviewUrl(result.url);
      toast.success("临时预览链接已生成，有效期 24 小时");
    });
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
                  <CardTitle className="flex items-center gap-2 text-base"><ImagePlus className="size-4" />商品图片</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => { uploadImages(event.target.files); event.target.value = ""; }} />
                  <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={isImagePending || images.length >= 12} onClick={() => imageInputRef.current?.click()}>{isImagePending ? <><Loader2 className="animate-spin" />上传中...</> : <><Upload />上传图片</>}</Button><span className="self-center text-xs text-muted-foreground">JPG、PNG、WebP；单张最大 2 MB，最多 12 张</span></div>
                  <div className="flex gap-2"><Input value={externalImageUrl} onChange={(event) => setExternalImageUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addExternalImage(); } }} placeholder="粘贴外部图片链接（https://...）" /><Button type="button" variant="outline" disabled={!externalImageUrl.trim() || images.length >= 12} onClick={addExternalImage}><Link2 />添加</Button></div>
                  {images.length > 0 ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((url, index) => { const isCover = form.getValues("coverImage") === url; return <div className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/30" key={url}><Image src={url} alt={`商品图片 ${index + 1}`} fill sizes="(max-width: 640px) 45vw, 160px" className="object-cover" /><div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/90 p-1.5 backdrop-blur-sm"><Button type="button" size="sm" variant={isCover ? "default" : "secondary"} className="h-7 px-2 text-[11px]" onClick={() => form.setValue("coverImage", url, { shouldDirty: true })}>{isCover ? "封面" : "设为封面"}</Button><Button type="button" size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive" disabled={isImagePending} onClick={() => removeImage(url)} aria-label={`删除图片 ${index + 1}`}><Trash2 className="size-3.5" /></Button></div></div>; })}</div> : <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">上传本地图片，或添加外部图片链接。</div>}
                  <FormField control={form.control} name="coverImage" render={({ field }) => <input type="hidden" {...field} value={field.value || ""} />} />
                  <FormField control={form.control} name="images" render={({ field }) => <input type="hidden" value={(field.value ?? []).join(",")} readOnly />} />
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
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Eye className="size-4" />临时预览</CardTitle></CardHeader>
                <CardContent className="space-y-3"><p className="text-sm text-muted-foreground">保存前可生成当前表单的只读预览链接，有效期 24 小时。</p><Button type="button" variant="outline" className="w-full" disabled={isPreviewPending} onClick={createPreview}>{isPreviewPending ? <><Loader2 className="animate-spin" />生成中...</> : <><Eye />生成预览链接</>}</Button>{previewUrl ? <div className="space-y-2 rounded-lg border bg-muted/20 p-2"><Input readOnly value={previewUrl} className="h-8 text-xs" /><div className="grid grid-cols-2 gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(previewUrl).then(() => toast.success("预览链接已复制"))}><Copy />复制</Button><Button asChild type="button" size="sm" variant="secondary"><a href={previewUrl} target="_blank" rel="noreferrer"><Eye />打开</a></Button></div></div> : null}</CardContent>
              </Card>
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
