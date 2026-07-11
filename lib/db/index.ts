import { cache } from "react";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

type HyperdriveBinding = { connectionString: string };

function getConnectionString() {
  try {
    const { env } = getCloudflareContext();
    const hyperdrive = (env as unknown as { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE;
    if (hyperdrive?.connectionString) return hyperdrive.connectionString;
  } catch {
    // next build and ordinary Node.js development do not have a Workers request context.
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL environment variable is not set");
  return process.env.DATABASE_URL;
}

/** Create a request-scoped client; Workers must not share live DB connections. */
export const getDb = cache((): PostgresJsDatabase<typeof schema> => {
  const client = postgres(getConnectionString(), {
    max: 1,
    idle_timeout: 1,
    max_lifetime: 1,
    connect_timeout: 10,
  });
  return drizzle(client, { schema });
});

export const db: PostgresJsDatabase<typeof schema> = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get(_target, prop: string | symbol) {
      const database = getDb();
      const value = database[prop as keyof typeof database];
      return typeof value === "function" ? value.bind(database) : value;
    },
  }
);

export * from "./schema";
