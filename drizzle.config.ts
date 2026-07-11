import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/d1-migrations",
  dialect: "sqlite",
  verbose: true,
  strict: true,
});
