// Дамп всех таблиц в JSON-файл (бэкап перед пересозданием ОРД-сида).
//   node --env-file=.env.local src/scripts/backup-db.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, connect_timeout: 15 });

const TABLES = [
  "user", "organization", "member", "invitation", "session", "account", "verification",
  "projects", "boards", "columns", "labels", "tasks", "task_labels", "task_links",
  "comments", "activity_events", "attachments", "task_templates", "document_set_templates",
  "custom_field_defs", "custom_field_values", "automations", "automation_runs",
];

const dump = {};
for (const t of TABLES) {
  try {
    dump[t] = await sql`select * from ${sql(t)}`;
    console.log(`  ${t}: ${dump[t].length}`);
  } catch (e) {
    console.log(`  ${t}: пропущено (${e.message})`);
  }
}

mkdirSync("backups", { recursive: true });
const file = `backups/backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify(dump, null, 2));
console.log(`\n✔ Бэкап сохранён: ${file}`);
await sql.end();
