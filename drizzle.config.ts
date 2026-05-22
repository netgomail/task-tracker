import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/app.db",
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
