/**
 * Разовая конвертация: прежний tasks.type (типы документов ОРД) → МЕТКИ.
 * Создаёт метки типов (name/color/icon), вешает на задачи по их текущему типу,
 * затем сбрасывает type в 'task'. Снимает старый CHECK, чтобы это прошло.
 * После — нужно прогнать `npm run db:migrate` (вернёт типовой CHECK + icon).
 *
 *   npx tsx --env-file=.env.local src/scripts/migrate-types-to-labels.ts
 */
import { randomUUID } from "node:crypto";

import postgres from "postgres";

import { ORD_TYPE_LABELS } from "./ord-type-labels";

const ORG_ID = process.env.SEED_ORG_ID ?? "3Mv7NfvJWKMYakcEppMKObf6AlV5tBQy";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL не задан");
const sql = postgres(DATABASE_URL, { ssl: false, connect_timeout: 15 });

async function main() {
  // Подготовка схемы под конвертацию (идемпотентно).
  await sql`ALTER TABLE labels ADD COLUMN IF NOT EXISTS icon text`;
  await sql`ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_chk`;
  await sql`ALTER TABLE task_templates DROP CONSTRAINT IF EXISTS task_templates_type_chk`;

  // Какие ОРД-типы реально встречаются у задач воркспейса.
  const present = await sql<{ type: string }[]>`
    select distinct type from tasks where workspace_id = ${ORG_ID}`;

  const typeToLabelId = new Map<string, string>();
  for (const { type } of present) {
    const cfg = ORD_TYPE_LABELS[type];
    if (!cfg) continue; // 'task' и прочие типовые пропускаем
    // Найти или создать метку по имени.
    const [existing] = await sql<{ id: string }[]>`
      select id from labels where workspace_id = ${ORG_ID} and name = ${cfg.name} limit 1`;
    let id = existing?.id;
    if (!id) {
      id = randomUUID();
      await sql`insert into labels ${sql({
        id,
        workspace_id: ORG_ID,
        name: cfg.name,
        color: cfg.color,
        icon: cfg.icon,
        created_at: new Date(),
      })} on conflict do nothing`;
      const [row] = await sql<{ id: string }[]>`
        select id from labels where workspace_id = ${ORG_ID} and name = ${cfg.name} limit 1`;
      id = row.id;
    } else {
      // Обновить цвет/иконку на актуальные.
      await sql`update labels set color = ${cfg.color}, icon = ${cfg.icon} where id = ${id}`;
    }
    typeToLabelId.set(type, id);
  }

  // Навесить метку по типу и сбросить тип.
  let attached = 0;
  for (const [type, labelId] of typeToLabelId) {
    const taskRows = await sql<{ id: string }[]>`
      select id from tasks where workspace_id = ${ORG_ID} and type = ${type}`;
    for (const t of taskRows) {
      await sql`insert into task_labels ${sql({
        task_id: t.id,
        label_id: labelId,
        created_at: new Date(),
      })} on conflict do nothing`;
      attached++;
    }
  }

  await sql`update tasks set type = 'task' where workspace_id = ${ORG_ID} and type <> 'task'`;
  await sql`update task_templates set type = 'task' where workspace_id = ${ORG_ID} and type <> 'task'`;

  console.log(
    `✔ Меток типов: ${typeToLabelId.size}; навешено на задачи: ${attached}; типы сброшены в 'task'.`,
  );
  console.log("→ Теперь выполни: npm run db:migrate");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
