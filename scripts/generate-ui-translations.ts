import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  enMessages,
  partialTranslations,
  translationOverrides,
  type Locale,
  type MessageKey,
} from "../lib/i18n";
import { generatedTranslations as currentGeneratedTranslations } from "../lib/i18n-generated";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_TOKEN;

if (!accountId || !apiToken) throw new Error("Cloudflare account ID and API token are required");

const targetLocales = ["ja", "ko", "es", "de", "pt", "ru", "id", "hi"] as const;
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/m2m100-1.2b?queueRequest=true`;
const synchronousEndpoint = endpoint.replace("?queueRequest=true", "");
const keys = Object.keys(enMessages) as MessageKey[];
const headers = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" };
const placeholderMarker = (index: number) => String(9_091_700_000 + index);

type BatchResponse = {
  external_reference?: string;
  success?: boolean;
  result?: { translated_text?: string };
};

async function callBatch(body: unknown) {
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Cloudflare AI returned ${response.status}`);
  const payload = await response.json() as {
    success?: boolean;
    result?: {
      status?: string;
      request_id?: string;
      responses?: BatchResponse[];
    };
    errors?: Array<{ message?: string }>;
  };
  if (!payload.success) throw new Error(payload.errors?.[0]?.message || "Cloudflare AI batch request failed");
  return payload.result;
}

async function translateSynchronously(text: string, locale: Locale) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(synchronousEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, source_lang: "en", target_lang: locale }),
    });
    const payload = await response.json() as {
      success?: boolean;
      result?: { translated_text?: string };
    };
    const translated = payload.result?.translated_text?.trim();
    if (response.ok && payload.success && translated) return translated;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500 * (attempt + 1)));
  }
  throw new Error(`Synchronous translation failed for ${locale}`);
}

async function translateLocale(locale: Exclude<Locale, "en" | "zh">) {
  const existing: Partial<Record<MessageKey, string>> = {
    ...currentGeneratedTranslations[locale],
    ...partialTranslations[locale],
    ...translationOverrides[locale],
  };
  const missingKeys = keys.filter((key) => !existing[key]);
  if (missingKeys.length === 0) {
    process.stdout.write(`${locale}: already complete\n`);
    return [locale, Object.fromEntries(keys.map((key) => [key, existing[key] as string]))] as const;
  }
  const plans = missingKeys.map((key) => {
    const placeholders = [...enMessages[key].matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]);
    const protectedText = placeholders.reduce(
      (message, placeholder, index) => message.replace(`{${placeholder}}`, placeholderMarker(index)),
      enMessages[key],
    );
    return { key, placeholders, parts: protectedText.split(/(?<=[.!?])(\s+)/) };
  });
  const requests = plans.flatMap(({ key, parts }) => parts.flatMap((part, index) =>
    /[\p{L}\p{N}]/u.test(part)
      ? [{
          text: part,
          source_lang: "en",
          target_lang: locale,
          external_reference: `${key}:${index}`,
        }]
      : []
  ));

  process.stdout.write(`${locale}: queueing ${missingKeys.length} messages\n`);
  const queued = await callBatch({ requests });
  if (!queued?.request_id) throw new Error(`No batch request ID returned for ${locale}`);

  let responses: BatchResponse[] | undefined;
  for (let attempt = 0; attempt < 180; attempt++) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
    const result = await callBatch({ request_id: queued.request_id });
    if (result?.responses) {
      responses = result.responses;
      break;
    }
  }
  if (!responses) throw new Error(`Translation batch timed out for ${locale}`);

  const translatedMessages = new Map<string, string>();
  for (const response of responses) {
    const translated = response.result?.translated_text?.trim();
    if (response.success && response.external_reference && translated) translatedMessages.set(response.external_reference, translated);
  }
  const retryRequests = requests.filter((request) => !translatedMessages.has(request.external_reference));
  if (retryRequests.length > 0) {
    process.stdout.write(`${locale}: retrying ${retryRequests.length} messages\n`);
    await Promise.all(retryRequests.map(async (request) => {
      translatedMessages.set(request.external_reference, await translateSynchronously(request.text, locale));
    }));
  }

  const translatedEntries = plans.map(({ key, placeholders, parts }) => {
    const translated = parts.map((part, index) =>
      /[\p{L}\p{N}]/u.test(part) ? translatedMessages.get(`${key}:${index}`) : part
    ).join("");
    if (!translated) throw new Error(`Missing translated message ${locale}:${key}`);
    const restored = placeholders.reduce(
      (message, placeholder, index) => message.replace(placeholderMarker(index), `{${placeholder}}`),
      translated,
    );
    if (!placeholders.every((placeholder) => restored.includes(`{${placeholder}}`))) {
      throw new Error(`Placeholder restoration failed for ${locale}:${key}`);
    }
    return [key, restored] as const;
  });

  process.stdout.write(`${locale}: completed\n`);
  return [locale, Object.fromEntries([
    ...keys.filter((key) => existing[key]).map((key) => [key, existing[key] as string] as const),
    ...translatedEntries,
  ])] as const;
}

async function main() {
  const translatedLocales = await Promise.all(targetLocales.map(translateLocale));
  const generated = Object.fromEntries(translatedLocales);
  const output = `// Generated by scripts/generate-ui-translations.ts using Cloudflare Workers AI.\n`
    + `// Edit English and Chinese source messages in lib/i18n.ts, then regenerate this file.\n`
    + `export const generatedTranslations = ${JSON.stringify(generated, null, 2)} as const;\n`;
  await writeFile(resolve(process.cwd(), "lib/i18n-generated.ts"), output, "utf8");
  process.stdout.write(`Wrote ${keys.length} messages for ${targetLocales.length} locales\n`);
}

void main();
