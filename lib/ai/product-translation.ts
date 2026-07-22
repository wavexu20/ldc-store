import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { locales, type Locale } from "@/lib/i18n";
import type { ProductTranslation, ProductTranslations } from "@/lib/db/schema";

export const PRODUCT_TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b" as const;

const MAX_CHUNK_LENGTH = 1_800;

type ProductTranslationSource = {
  name: string;
  description?: string | null;
  content?: string | null;
};

function splitText(text: string, maxLength = MAX_CHUNK_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/(\n{2,})/)) {
    if (current && current.length + paragraph.length > maxLength) {
      chunks.push(current);
      current = "";
    }
    if (paragraph.length <= maxLength) {
      current += paragraph;
      continue;
    }
    for (let offset = 0; offset < paragraph.length; offset += maxLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(paragraph.slice(offset, offset + maxLength));
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translatePlainText(
  ai: Ai,
  text: string,
  sourceLocale: Locale,
  targetLocale: Locale
): Promise<string> {
  if (!text.trim()) return text;

  const translatedChunks = await Promise.all(
    splitText(text).map(async (chunk) => {
      if (!chunk.trim()) return chunk;
      const result = await ai.run(PRODUCT_TRANSLATION_MODEL, {
        text: chunk,
        source_lang: sourceLocale,
        target_lang: targetLocale,
      });
      const translated = "translated_text" in result ? result.translated_text : undefined;
      if (!translated?.trim()) {
        throw new Error(`Cloudflare AI 未返回 ${targetLocale} 翻译结果`);
      }
      return translated;
    })
  );

  return translatedChunks.join("");
}

async function translateMarkdown(
  ai: Ai,
  markdown: string,
  sourceLocale: Locale,
  targetLocale: Locale
): Promise<string> {
  // 媒体标签、图片和链接中的 URL 必须保持原样，避免翻译模型破坏可访问地址。
  const segments = markdown.split(/(```[\s\S]*?```|!\[[^\]]*\]\([^\n)]+\)|\[[^\]]+\]\([^\n)]+\)|<video\b[\s\S]*?<\/video>|<\/?span\b[^>]*>)/gi);
  const translated = await Promise.all(
    segments.map((segment) =>
      segment.startsWith("```") || /^!?(?:\[[^\]]+\]\(|<video\b|<\/?span\b)/i.test(segment)
        ? Promise.resolve(segment)
        : translatePlainText(ai, segment, sourceLocale, targetLocale)
    )
  );
  return translated.join("");
}

export async function generateProductTranslations(
  source: ProductTranslationSource,
  sourceLocale: Locale
): Promise<{ translations: ProductTranslations; failedLocales: Locale[] }> {
  const { env } = getCloudflareContext();
  if (!env.AI) throw new Error("Cloudflare Workers AI binding 未配置");

  const targets = locales.filter((locale) => locale !== sourceLocale);
  const results = await Promise.all(
    targets.map(async (targetLocale) => {
      try {
        const translated: ProductTranslation = {
          name: await translatePlainText(env.AI, source.name, sourceLocale, targetLocale),
        };

        const [description, content] = await Promise.all([
          source.description
            ? translatePlainText(env.AI, source.description, sourceLocale, targetLocale)
            : Promise.resolve(undefined),
          source.content
            ? translateMarkdown(env.AI, source.content, sourceLocale, targetLocale)
            : Promise.resolve(undefined),
        ]);
        if (description) translated.description = description;
        if (content) translated.content = content;
        return { targetLocale, translated };
      } catch (error) {
        console.error(`[productTranslation] ${targetLocale} 翻译失败:`, error);
        return { targetLocale, translated: null };
      }
    })
  );

  const successfulEntries = results
    .filter(
      (result): result is { targetLocale: Locale; translated: ProductTranslation } =>
        result.translated !== null
    )
    .map((result) => [result.targetLocale, result.translated] as const);
  if (successfulEntries.length === 0) {
    throw new Error("Cloudflare AI 未生成任何商品翻译");
  }

  return {
    translations: Object.fromEntries(successfulEntries) as ProductTranslations,
    failedLocales: results
      .filter((result) => result.translated === null)
      .map((result) => result.targetLocale),
  };
}

export const productTranslationInternals = { splitText };
