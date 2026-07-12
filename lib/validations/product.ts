import { z } from "zod";

export const productTranslationLocales = ["en", "ko", "zh", "ru", "de", "id", "hi"] as const;

export const productVariantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "规格名称不能为空").max(80, "规格名称最多80字符"),
  price: z.number().positive("规格售价必须大于0"),
  originalPrice: z.number().positive("规格原价必须大于0").optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
});

// 创建/更新商品验证
const productFieldsSchema = z.object({
  name: z.string().min(1, "商品名称不能为空").max(100, "商品名称最多100字符"),
  slug: z
    .string()
    .min(1, "URL标识不能为空")
    .max(100, "URL标识最多100字符")
    .regex(/^[a-z0-9-]+$/, "URL标识只能包含小写字母、数字和连字符"),
  categoryId: z.string().uuid("无效的分类ID").nullable().optional(),
  description: z.string().max(500, "简短描述最多500字符").optional(),
  content: z.string().optional(), // Markdown 内容
  price: z.number().nonnegative("价格不能小于0"),
  originalPrice: z.number().positive("原价必须大于0").optional().nullable(),
  coverImage: z.string().url("无效的图片URL").optional().nullable().or(z.literal("")),
  images: z.array(z.string().url()).max(12, "商品图片最多 12 张").optional(),
  variants: z.array(productVariantSchema).max(30, "单个商品最多 30 个规格").optional().default([]),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  minQuantity: z.number().int().min(1).default(1),
  maxQuantity: z.number().int().min(1).default(10),
  autoTranslate: z.boolean().default(true),
  translationSourceLocale: z.enum(productTranslationLocales).default("zh"),
});

export const productSchema = productFieldsSchema.superRefine((input, ctx) => {
  if ((input.variants?.length ?? 0) === 0 && input.price !== undefined && input.price <= 0) {
    ctx.addIssue({ code: "custom", path: ["price"], message: "单规格商品的价格必须大于0" });
  }
});

export const createProductSchema = productSchema;
export const updateProductSchema = productFieldsSchema.partial().superRefine((input, ctx) => {
  if (input.price !== undefined && (input.variants?.length ?? 0) === 0 && input.price <= 0) {
    ctx.addIssue({ code: "custom", path: ["price"], message: "单规格商品的价格必须大于0" });
  }
});

export const productPreviewSchema = z.object({
  name: z.string().trim().min(1, "请先填写商品名称").max(100, "商品名称最多100字符"),
  categoryId: z.string().uuid("无效的分类ID").nullable().optional(),
  description: z.string().max(500, "简短描述最多500字符").optional().default(""),
  content: z.string().optional().default(""),
  price: z.number().nonnegative("预览价格不能小于 0").default(0),
  originalPrice: z.number().nonnegative("原价不能小于 0").optional().nullable(),
  coverImage: z.string().url("无效的图片URL").optional().nullable().or(z.literal("")),
  images: z.array(z.string().url()).max(12, "商品图片最多 12 张").optional().default([]),
  isFeatured: z.boolean().default(false),
});

export type ProductInput = z.input<typeof productSchema>;
export type ProductOutput = z.infer<typeof productSchema>;
export type CreateProductInput = z.input<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
