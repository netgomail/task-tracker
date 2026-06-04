// Postgres + Drizzle client. Importable from any environment (Node scripts,
// migrations, server runtime). Use `@/db` from app code — it adds the
// server-only guard. Use `@/db/client` from build/migration scripts.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";

// В Turbopack-dev module-scope не общий между Server Actions и роут-хендлерами,
// а HMR пересоздаёт модули — без синглтона на globalThis плодятся пулы
// соединений и быстро упираемся в лимит Postgres. Держим один клиент на процесс.
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

export const client =
  globalForDb.__pgClient ?? postgres(env.DATABASE_URL, { max: 10 });

if (env.NODE_ENV !== "production") globalForDb.__pgClient = client;

export const db = drizzle({ client, casing: "snake_case" });
export type DB = typeof db;
