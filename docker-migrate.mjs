// Запуск Drizzle-миграций внутри production-контейнера.
// В standalone-сборке нет tsx и исходников, поэтому это самостоятельный ESM-скрипт.
// drizzle-orm + postgres докладываются в образ отдельно (см. Dockerfile),
// SQL-миграции лежат рядом в ./src/db/migrations.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required (postgres://…)");
  process.exit(1);
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(dir, "src", "db", "migrations");

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder });
  console.log("✔ migrations applied");
} catch (err) {
  console.error("migration failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
