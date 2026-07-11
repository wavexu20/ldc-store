import { cache } from "react";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

type DrizzleD1Binding = Parameters<typeof drizzle>[0];

export interface D1BatchResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
}

export interface D1Binding {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[]
  ): Promise<D1BatchResult<T>[]>;
}

export function getD1Binding(): DrizzleD1Binding & D1Binding {
  try {
    const { env } = getCloudflareContext();
    const binding = (env as unknown as { DB?: DrizzleD1Binding & D1Binding }).DB;
    if (binding) return binding;
  } catch {
    // Next build and ordinary Node.js development do not have a Workers request context.
  }
  throw new Error("Cloudflare D1 binding DB is not available");
}

export const getDb = cache(
  (): DrizzleD1Database<typeof schema> => drizzle(getD1Binding(), { schema })
);

export const db: DrizzleD1Database<typeof schema> = new Proxy(
  {} as DrizzleD1Database<typeof schema>,
  {
    get(_target, prop: string | symbol) {
      const database = getDb();
      const value = database[prop as keyof typeof database];
      return typeof value === "function" ? value.bind(database) : value;
    },
  }
);

export * from "./schema";
