"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productSchema, type ProductInput } from "@/lib/validations/product";
import { localeMeta, locales } from "@/lib/i18n";
import { type AdminCategoryOption } from "@/lib/actions/categories";
import { deleteProductImage } from "@/lib/actions/product-images";
import { createProductPreview } from "@/lib/actions/product-previews";
import { adaptProductImages, PRODUCT_IMAGE_MAX_SOURCE_BYTES } from "@/lib/product-image-adapter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fulfillmentModeMeta, fulfillmentModeValues } from "@/lib/fulfillment";
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
import { Loader2, ArrowLeft, Package, Save, Copy, Languages, Eye, ImagePlus, Link2, Trash2, Upload, Layers3, Plus, Boxes, ExternalLink } from "lucide-react";
import Link from "next/link";

export interface ProductFormInventory {
  publicStock: number;
  inactiveStock: number;
  variantStock: Record<string, number>;
}

interface ProductFormProps {
  initialData?: Partial<ProductInput>;
  categories: AdminCategoryOption[];
  onSubmit: (values: ProductInput) => Promise<{ success: boolean; message?: string; data?: { id: string } }>;
  isEdit?: boolean;
  templateInfo?: { name: string } | null;
  productId?: string;
  inventory?: ProductFormInventory;
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
  variants: [],
  isActive: true,
  isFeatured: false,
  sortOrder: 0,
  minQuantity: 1,
  maxQuantity: 10,
  fulfillmentMode: "auto",
  autoTranslate: true,
  translationSourceLocale: "zh",
};

export function ProductForm({
  initialData,
  categories,
  onSubmit,
  isEdit = false,
  templateInfo = null,
  productId,
  inventory,
}: ProductFormProps) {
  const [isPending, startTransition] = useTransition();
  const [isImagePending, startImageTransition] = useTransition();
  const [isPreviewPending, startPreviewTransition] = useTransition();
  const [externalImageUrl, setExternalImageUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [draftVariantName, setDraftVariantName] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const submitDestinationRef = useRef<"products" | "inventory">("products");
  const router = useRouter();

  const form = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: { ...defaultValues, ...initialData },
  });

  const watchName = form.watch("name");
  const images = form.watch("images") ?? [];
  const variants = form.watch("variants") ?? [];
  const manualFulfillment = form.watch("fulfillmentMode") !== "auto";
  const usesVariantPricing = variants.length > 0;
  const publicStock = inventory?.publicStock ?? 0;
  const initialUsesVariantPricing = (initialData?.variants?.length ?? 0) > 0;
  const initialVariantStock = Object.values(inventory?.variantStock ?? {}).reduce(
    (sum, stock) => sum + stock,
    0
  );
  const activeVariantStock = variants.reduce(
    (sum, variant) => sum + (variant.id ? inventory?.variantStock[variant.id] ?? 0 : 0),
    0
  );
  const knownAvailableStock = (inventory?.inactiveStock ?? 0)
    + (initialUsesVariantPricing ? initialVariantStock : publicStock);
  const inactiveStock = Math.max(
    0,
    knownAvailableStock - (usesVariantPricing ? activeVariantStock : publicStock)
  );
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
    const selectedFiles = Array.from(files);
    if (selectedFiles.length > 6) {
      toast.error("单次最多上传 6 张图片");
      return;
    }
    if (images.length + selectedFiles.length > 12) {
      toast.error(`最多上传 12 张图片，当前还可上传 ${12 - images.length} 张`);
      return;
    }
    const invalidType = selectedFiles.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type));
    if (invalidType) {
      toast.error("仅支持 JPG、PNG 或 WebP 图片");
      return;
    }
    const oversizedFile = selectedFiles.find((file) => file.size > PRODUCT_IMAGE_MAX_SOURCE_BYTES);
    if (oversizedFile) {
      toast.error(`图片「${oversizedFile.name}」超过 10 MB`);
      return;
    }
    startImageTransition(async () => {
      try {
        const adaptedFiles = await adaptProductImages(selectedFiles);
        const formData = new FormData();
        adaptedFiles.forEach((file) => formData.append("images", file));
        const response = await fetch("/api/admin/product-images", { method: "POST", body: formData });
        const result = await response.json().catch(() => null) as { success?: boolean; urls?: string[]; message?: string } | null;
        if (!response.ok || !result?.success || !result.urls) {
          toast.error(result?.message || "图片上传失败，请稍后重试");
          return;
        }
        updateImages([...images, ...result.urls]);
        toast.success(`已自动适配并上传 ${result.urls.length} 张图片`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "图片上传失败，请检查网络后重试");
      }
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
      try {
        const result = await createProductPreview(form.getValues());
        if (!result.success || !result.url) {
          toast.error(result.message || "临时预览链接创建失败");
          return;
        }
        setPreviewUrl(result.url);
        toast.success("临时预览链接已生成，有效期 2 小时");
      } catch {
        toast.error("临时预览链接创建失败，请稍后重试");
      }
    });
  };

  const addVariant = (name?: string) => {
    const currentPrice = form.getValues("price") || 1;
    if (form.getValues("price") <= 0) form.setValue("price", currentPrice, { shouldValidate: true });
    form.setValue("variants", [...variants, { name: name?.trim() || `规格 ${variants.length + 1}`, price: currentPrice, originalPrice: undefined, sortOrder: variants.length }], { shouldDirty: true, shouldValidate: true });
  };

  const updateVariant = (index: number, patch: Record<string, unknown>) => {
    form.setValue("variants", variants.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...patch } : variant), { shouldDirty: true, shouldValidate: true });
  };

  const removeVariant = (index: number) => {
    const variant = variants[index];
    const stock = variant?.id ? inventory?.variantStock[variant.id] ?? 0 : 0;
    if (stock > 0 && !window.confirm(`规格「${variant.name}」还有 ${stock} 个可用卡密。移除后这些卡密不会计入可售库存，确定继续吗？`)) return;
    if (variants.length === 1) {
      form.setValue("price", variant.price, { shouldDirty: true, shouldValidate: true });
      form.setValue("originalPrice", variant.originalPrice, { shouldDirty: true, shouldValidate: true });
    }
    form.setValue("variants", variants.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })), { shouldDirty: true, shouldValidate: true });
  };

  const activateFirstVariant = () => {
    const name = draftVariantName.trim();
    if (!name) return;
    if (publicStock > 0 && !window.confirm(`当前公共库存还有 ${publicStock} 个可用卡密。填写规格后，需要在卡密管理中把库存归属到具体规格，确定继续吗？`)) return;
    addVariant(name);
    setDraftVariantName("");
  };

  const handleSubmit = (values: ProductInput) => {
    startTransition(async () => {
      try {
        const result = await onSubmit(values);

        if (result.success) {
          toast.success(result.message || (isEdit ? "商品更新成功" : "商品创建成功"));
          if (!isEdit && submitDestinationRef.current === "inventory" && result.data?.id) {
            window.location.assign(`/admin/cards?product=${result.data.id}`);
          } else if (!isEdit) {
            window.location.assign("/admin/products");
          } else {
            router.push("/admin/products");
          }
        } else {
          toast.error(result.message || (isEdit ? "商品保存失败" : "商品创建失败"));
        }
      } catch {
        toast.error(isEdit ? "商品保存失败，请稍后重试" : "商品创建失败，请稍后重试");
      }
    });
  };

  const handleInvalid = (errors: FieldErrors<ProductInput>) => {
    const findMessage = (value: unknown): string | null => {
      if (!value || typeof value !== "object") return null;
      const record = value as Record<string, unknown>;
      if (typeof record.message === "string") return record.message;
      for (const child of Object.values(record)) {
        const message = findMessage(child);
        if (message) return message;
      }
      return null;
    };
    toast.error(findMessage(errors) || "请检查商品信息后再提交");
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
        <form onSubmit={form.handleSubmit(handleSubmit, handleInvalid)} className="space-y-6">
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

              <Card>
                <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><Layers3 className="size-4" />价格、规格与库存</CardTitle>
                  {usesVariantPricing ? <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => addVariant()}><Plus />添加规格</Button> : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  {usesVariantPricing ? variants.map((variant, index) => { const variantStock = variant.id ? inventory?.variantStock[variant.id] ?? 0 : 0; const showStock = Boolean(productId && !manualFulfillment); return <div className={`grid gap-3 rounded-lg border p-3 md:items-end ${showStock ? "md:grid-cols-[minmax(0,1fr)_140px_140px_110px_auto]" : "md:grid-cols-[minmax(0,1fr)_160px_160px_auto]"}`} key={variant.id || `new-${index}`}><div className="space-y-1"><Label htmlFor={`variant-name-${index}`}>规格名称</Label><Input id={`variant-name-${index}`} value={variant.name} onChange={(event) => updateVariant(index, { name: event.target.value })} onBlur={(event) => { if (!event.target.value.trim()) removeVariant(index); }} placeholder="例如：月卡" /></div><div className="space-y-1"><Label htmlFor={`variant-price-${index}`}>售价</Label><Input id={`variant-price-${index}`} type="number" min="0.01" step="0.01" value={variant.price} onChange={(event) => updateVariant(index, { price: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0 })} /></div><div className="space-y-1"><Label htmlFor={`variant-original-price-${index}`}>原价</Label><Input id={`variant-original-price-${index}`} type="number" min="0.01" step="0.01" value={variant.originalPrice || ""} onChange={(event) => updateVariant(index, { originalPrice: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : undefined })} /></div>{showStock ? <div className="space-y-1"><Label>可售库存</Label><div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium tabular-nums">{variantStock} 个</div></div> : null}<Button type="button" size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeVariant(index)} aria-label={`删除规格 ${variant.name || index + 1}`}><Trash2 className="size-4" /></Button></div>; }) : <div className="space-y-2"><Label htmlFor="optional-variant-name">规格名称（可选）</Label><Input id="optional-variant-name" value={draftVariantName} onChange={(event) => setDraftVariantName(event.target.value)} onBlur={activateFirstVariant} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} placeholder="留空即为单一售价，例如：月卡" /></div>}
                  {productId && !manualFulfillment ? <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3"><Boxes className="size-4 shrink-0" /><p className="text-sm font-medium">{usesVariantPricing ? `规格库存 ${activeVariantStock}` : `公共库存 ${publicStock}`}</p></div>
                    {!manualFulfillment ? <Button asChild type="button" size="sm" variant="outline"><Link href={`/admin/cards?product=${productId}`}><ExternalLink />管理卡密库存</Link></Button> : null}
                  </div> : null}
                  {productId && !manualFulfillment && inactiveStock > 0 ? <Alert variant="destructive"><AlertTitle>{inactiveStock} 个卡密未计入库存</AlertTitle></Alert> : null}
                  <div className="space-y-4 border-t pt-4">
                    {!usesVariantPricing ? <div className="grid gap-4 sm:grid-cols-2"><FormField control={form.control} name="price" render={({ field }) => <FormItem><FormLabel>售价 *</FormLabel><FormControl><Input type="number" step={0.01} min={0.01} placeholder="0" {...field} onChange={(e) => field.onChange(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0)} /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="originalPrice" render={({ field }) => <FormItem><FormLabel>原价（划线价）</FormLabel><FormControl><Input type="number" step={0.01} min={0.01} placeholder="0" value={field.value || ""} onChange={(e) => { const val = e.target.valueAsNumber; field.onChange(Number.isFinite(val) ? val : undefined); }} /></FormControl><FormMessage /></FormItem>} /></div> : null}
                    <div className="grid gap-4 sm:grid-cols-2"><FormField control={form.control} name="minQuantity" render={({ field }) => <FormItem><FormLabel>最小购买数量</FormLabel><FormControl><Input type="number" min={1} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 1)} /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="maxQuantity" render={({ field }) => <FormItem><FormLabel>最大购买数量</FormLabel><FormControl><Input type="number" min={1} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 10)} /></FormControl><FormMessage /></FormItem>} /></div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><ImagePlus className="size-4" />商品图片</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => { uploadImages(event.target.files); event.target.value = ""; }} />
                  <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={isImagePending || images.length >= 12} onClick={() => imageInputRef.current?.click()}>{isImagePending ? <><Loader2 className="animate-spin" />适配并上传...</> : <><Upload />上传图片</>}</Button><span className="self-center text-xs text-muted-foreground">自动生成 1200×900 WebP；原图最大 10 MB，最多 12 张</span></div>
                  <div className="flex gap-2"><Input value={externalImageUrl} onChange={(event) => setExternalImageUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addExternalImage(); } }} placeholder="粘贴外部图片链接（https://...）" /><Button type="button" variant="outline" disabled={!externalImageUrl.trim() || images.length >= 12} onClick={addExternalImage}><Link2 />添加</Button></div>
                  {images.length > 0 ? <div className="grid grid-cols-2 gap-3">{images.map((url, index) => { const isCover = form.getValues("coverImage") === url; return <div className="group relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted/30" key={url}><Image src={url} alt={`商品图片 ${index + 1}`} fill sizes="(max-width: 640px) 45vw, 190px" className="object-cover" unoptimized={url.startsWith("/api/product-images/")} /><div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 border-t bg-background/95 p-1.5 backdrop-blur-sm"><Button type="button" size="sm" variant={isCover ? "default" : "secondary"} className="h-7 px-2 text-[11px]" onClick={() => form.setValue("coverImage", url, { shouldDirty: true })}>{isCover ? "封面" : "设为封面"}</Button><Button type="button" size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive" disabled={isImagePending} onClick={() => removeImage(url)} aria-label={`删除图片 ${index + 1}`}><Trash2 className="size-3.5" /></Button></div></div>; })}</div> : <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">本地图片会自动适配为 4:3，外部图片链接保持原始尺寸。</div>}
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
                    name="fulfillmentMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>发货方式</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {fulfillmentModeValues.map((mode) => (
                              <SelectItem key={mode} value={mode}>{fulfillmentModeMeta[mode].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          自动发货使用预存卡密；人工发货在订单后台填写交付内容。
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                <CardContent className="space-y-3"><p className="text-sm text-muted-foreground">保存前可生成当前表单的只读预览链接，有效期 2 小时。</p><Button type="button" variant="outline" className="w-full" disabled={isPreviewPending} onClick={createPreview}>{isPreviewPending ? <><Loader2 className="animate-spin" />生成中...</> : <><Eye />生成预览链接</>}</Button>{previewUrl ? <div className="space-y-2 rounded-lg border bg-muted/20 p-2"><Input readOnly value={previewUrl} className="h-8 text-xs" /><div className="grid grid-cols-2 gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(previewUrl).then(() => toast.success("预览链接已复制"))}><Copy />复制</Button><Button asChild type="button" size="sm" variant="secondary"><a href={previewUrl} target="_blank" rel="noreferrer"><Eye />打开</a></Button></div></div> : null}</CardContent>
              </Card>
              <div className="grid gap-2">
              <Button type="submit" className="w-full gap-2" size="lg" disabled={isPending} onClick={() => { submitDestinationRef.current = isEdit || manualFulfillment ? "products" : "inventory"; }}>
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
                    {isEdit ? "保存修改" : manualFulfillment ? <><Save className="h-4 w-4" />创建商品</> : <><Boxes className="h-4 w-4" />创建并导入卡密</>}
                  </>
                )}
              </Button>
              {!isEdit && !manualFulfillment ? <Button type="submit" variant="outline" disabled={isPending} onClick={() => { submitDestinationRef.current = "products"; }}>仅创建商品</Button> : null}
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
