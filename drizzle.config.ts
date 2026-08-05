// @ts-nocheck
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/database/src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://professor_carvalho:changeme@localhost:5432/professor_carvalho",
  },
  verbose: true,
  strict: true,
});
