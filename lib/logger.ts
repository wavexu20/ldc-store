import "server-only";

import { headers } from "next/headers";

const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "token",
  "key",
  "authorization",
  "cookie",
  "sign",
]);

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEYS.has(key.toLowerCase()))
      .map(([key, item]) => [key, sanitize(item)])
  );
}

type LogMethod = (dataOrMessage?: unknown, message?: string) => void;
export interface AppLogger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  child: (bindings: Record<string, unknown>) => AppLogger;
}

function createLogger(bindings: Record<string, unknown> = {}): AppLogger {
  const write = (level: "debug" | "info" | "warn" | "error"): LogMethod =>
    (dataOrMessage, message) => {
      const payload =
        typeof dataOrMessage === "string"
          ? { ...bindings, message: dataOrMessage }
          : { ...bindings, ...(sanitize(dataOrMessage) as object), message };
      const method = level === "debug" ? console.log : console[level];
      method(JSON.stringify({ level, ...payload }));
    };
  return {
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
    child: (childBindings) =>
      createLogger({
        ...bindings,
        ...(sanitize(childBindings) as Record<string, unknown>),
      }),
  };
}

export const logger = createLogger();

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

export async function getRequestIdFromHeaders(): Promise<string | undefined> {
  try {
    const headersList = await headers();
    return headersList.get("x-request-id") || undefined;
  } catch {
    return undefined;
  }
}
