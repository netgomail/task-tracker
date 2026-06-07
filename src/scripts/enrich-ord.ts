/**
 * Дообогащение УЖЕ засеянных документов: проставляет описания (правовое
 * основание) и осмысленные подзадачи, не трогая остальное (вложения, связи,
 * позиции). Идемпотентно: описание ставится только если пустое, подзадачи —
 * только если их ещё нет.
 *
 *   npx tsx --env-file=.env.local src/scripts/enrich-ord.ts
 */
import { randomUUID } from "node:crypto";

import { generateNKeysBetween } from "fractional-indexing";
import postgres from "postgres";

import { ORD_DESCRIPTIONS } from "./ord-descriptions";
import { ORD_SUBTASKS } from "./ord-subtasks";

const ORG_ID = process.env.SEED_ORG_ID ?? "3Mv7NfvJWKMYakcEppMKObf6AlV5tBQy";
const USER_ID = process.env.SEED_USER_ID ?? "kZWBRa3XBfPVkWfKfnShEl5nA5s1uq65";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL не задан");
const sql = postgres(DATABASE_URL, { ssl: false, connect_timeout: 15 });

async function main() {
  const docs = await sql<{ id: string; title: string; project_id: string; column_id: string; description: string | null }[]>`
    select id, title, project_id, column_id, description
    from tasks
    where workspace_id = ${ORG_ID} and parent_id is null and archived_at is null`;

  let descSet = 0;
  let subAdded = 0;
  const now = new Date();

  for (const doc of docs) {
    // Описание — только если сейчас пустое.
    const desc = ORD_DESCRIPTIONS[doc.title];
    if (desc && (!doc.description || !doc.description.trim())) {
      await sql`update tasks set description = ${desc}, updated_at = ${now} where id = ${doc.id}`;
      descSet++;
    }

    // Подзадачи — только если их ещё нет у этого документа.
    const subs = ORD_SUBTASKS[doc.title];
    if (subs?.length) {
      const [{ n }] = await sql<{ n: number }[]>`
        select count(*)::int n from tasks where parent_id = ${doc.id}`;
      if (n === 0) {
        const keys = generateNKeysBetween(null, null, subs.length);
        for (let s = 0; s < subs.length; s++) {
          await sql`insert into tasks ${sql({
            id: randomUUID(),
            workspace_id: ORG_ID,
            project_id: doc.project_id,
            column_id: doc.column_id,
            parent_id: doc.id,
            title: subs[s],
            type: "other",
            priority: "normal",
            color: "slate",
            order_key: keys[s],
            created_by: USER_ID,
            created_at: now,
            updated_at: now,
          })}`;
          subAdded++;
        }
      }
    }
  }

  console.log(`✔ Описаний проставлено: ${descSet}; подзадач добавлено: ${subAdded}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
