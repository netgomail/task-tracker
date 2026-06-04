/**
 * Разовый перенос данных из старой SQLite-базы в Postgres.
 *
 *   SQLITE_PATH=./data/app.db npm run db:migrate-data
 *
 * Идемпотентность: вставка через ON CONFLICT DO NOTHING, так что повторный
 * запуск не падает на уже перенесённых строках. Перед запуском убедись, что
 * PG-миграции уже применены (npm run db:migrate).
 *
 * Конвертации:
 *   - timestamp_ms (integer) → timestamptz: по типу колонки в PG.
 *   - boolean (0/1)          → boolean:     по типу колонки в PG.
 *   - search_vector          → пропускаем (генерируемая колонка).
 */
import Database from "better-sqlite3";
import postgres from "postgres";

import { env } from "@/lib/env";

const SQLITE_PATH = process.env.SQLITE_PATH ?? "./data/app.db";

// Порядок важен: родительские таблицы раньше дочерних (FK).
const TABLES = [
  "user",
  "organization",
  "member",
  "invitation",
  "session",
  "account",
  "verification",
  "projects",
  "boards",
  "columns",
  "labels",
  "tasks",
  "task_labels",
  "comments",
  "activity_events",
  "attachments",
  "task_templates",
  "custom_field_defs",
  "custom_field_values",
  "automations",
  "automation_runs",
] as const;

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const sql = postgres(env.DATABASE_URL, { max: 1 });

/** Типы колонок в PG для конвертации значений из SQLite. */
async function pgColumnTypes(table: string): Promise<Map<string, string>> {
  const rows = await sql<{ column_name: string; data_type: string }[]>`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}`;
  return new Map(rows.map((r) => [r.column_name, r.data_type]));
}

function convertRow(
  row: Record<string, unknown>,
  types: Map<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const type = types.get(key);
    if (type === undefined) continue; // колонки нет в PG (напр. служебные) — пропускаем
    if (value === null || value === undefined) {
      out[key] = null;
    } else if (type.includes("timestamp")) {
      // Обычно integer epoch-ms, но better-auth кое-где писал ISO-строку.
      const s = String(value).trim();
      const d = /^\d+$/.test(s) ? new Date(Number(s)) : new Date(s);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`Не разобрал timestamp в ${key}: ${JSON.stringify(value)}`);
      }
      out[key] = d;
    } else if (type === "boolean") {
      out[key] = Boolean(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function migrateTable(table: string): Promise<number> {
  const types = await pgColumnTypes(table);
  const rawRows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
  if (rawRows.length === 0) return 0;

  // tasks.parent_id — самоссылка: вставляем без неё, проставим вторым проходом.
  const isTasks = table === "tasks";
  const rows = rawRows.map((r) => {
    const c = convertRow(r, types);
    if (isTasks) c.parent_id = null;
    return c;
  });

  const cols = Object.keys(rows[0]);
  // Бьём на чанки, чтобы не упереться в лимит параметров запроса.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await sql`INSERT INTO ${sql(table)} ${sql(chunk, ...cols)} ON CONFLICT DO NOTHING`;
  }

  if (isTasks) {
    for (const r of rawRows) {
      if (r.parent_id) {
        await sql`UPDATE tasks SET parent_id = ${r.parent_id as string} WHERE id = ${r.id as string}`;
      }
    }
  }
  return rows.length;
}

async function main() {
  for (const table of TABLES) {
    const n = await migrateTable(table);
    console.log(`${table.padEnd(22)} → ${n} строк`);
  }
  await sql.end();
  sqlite.close();
  console.log("✔ перенос данных завершён");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
