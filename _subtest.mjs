import postgres from "postgres";
import { createHash, randomBytes } from "node:crypto";
const sql = postgres(process.env.DATABASE_URL, { ssl: false });
const [org] = await sql`select id from organization order by created_at limit 1`;
const [mem] = await sql`select user_id from member where organization_id = ${org.id} limit 1`;
// корневая задача без подзадач
const [root] = await sql`
  select t.id, t.title from tasks t
  where t.workspace_id=${org.id} and t.parent_id is null and t.archived_at is null
    and not exists (select 1 from tasks c where c.parent_id=t.id)
  order by t.order_key limit 1`;
const secret = "obs_" + randomBytes(32).toString("base64url");
await sql`insert into sync_tokens (id, workspace_id, user_id, name, token_hash) values (${randomBytes(8).toString("hex")}, ${org.id}, ${mem.user_id}, ${'__subtest__'}, ${createHash("sha256").update(secret).digest("hex")})`;
console.log(JSON.stringify({ secret, taskId: root.id, taskTitle: root.title }));
await sql.end();
