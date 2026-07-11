import { z } from "zod";

export const productTranslationLocales = ["en", "ko", "zh", "ru", "de", "id", "hi"] as const;

// 创建/更新商品验证
export const productSchema = z.object({
  name: z.string().min(1, "商品名称不能为空").max(100, "商品名称最多100字符"),
  slug: z
    .string()
    .min(1, "URL标识不能为空")
    .max(100, "URL标识最多100字符")
    .regex(/^[a-z0-9-]+$/, "URL标识只能包含小写字母、数字和连字符"),
  categoryId: z.string().uuid("无效的分类ID").nullable().optional(),
  description: z.string().max(500, "简短描述最多500字符").optional(),
  content: z.string().optional(), // Markdown 内容
  price: z.number().positive("价格必须大于0"),
  originalPrice: z.number().positive("原价必须大于0").optional().nullable(),
  coverImage: z.string().url("无效的图片URL").optional().nullable().or(z.literal("")),
  images: z.array(z.string().url()).optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  minQuantity: z.number().int().min(1).default(1),
  maxQuantity: z.number().int().min(1).default(10),
  autoTranslate: z.boolean().default(true),
  translationSourceLocale: z.enum(productTranslationLocales).default("zh"),
});

export const createProductSchema = productSchema;
export const updateProductSchema = productSchema.partial();

export type ProductInput = z.input<typeof productSchema>;
export type ProductOutput = z.infer<typeof productSchema>;
export type CreateProductInput = z.input<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
