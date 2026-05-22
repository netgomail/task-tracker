// Pure SQLite + Drizzle client. Importable from any environment (Node scripts,
// migrations, server runtime). Use `@/db` from app code — it adds the
// server-only guard. Use `@/db/client` from build/migration scripts.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { env } from "@/lib/env";

function resolveDbPath(url: string): string {
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}

const dbPath = resolveDbPath(env.DATABASE_URL);
mkdirSync(dirname(dbPath), { recursive: true });

export const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle({ client: sqlite, casing: "snake_case" });
export type DB = typeof db;
