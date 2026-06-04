import { client } from "@/db/client";

const userId = "XlDt9CeSlKoR3vtXh8FC0ns0eTw67bSO";
const wsSlug = "komanda-produkta-019e4fac";
const projectSlug = "019e4fb4";

async function main() {
  const [ws] = await client<{ workspaceId: string; name: string; role: string }[]>`
    SELECT o.id AS "workspaceId", o.name, m.role
    FROM organization o
    JOIN member m ON m.organization_id = o.id
    WHERE o.slug = ${wsSlug} AND m.user_id = ${userId}
    LIMIT 1`;
  console.log("ws:", ws);
  if (!ws) process.exit(1);
  const wsId = ws.workspaceId;

  const [project] = await client`
    SELECT p.id, p.slug, p.archived_at, b.id AS "boardId"
    FROM projects p
    INNER JOIN boards b ON b.project_id = p.id
    WHERE p.workspace_id = ${wsId} AND p.slug = ${projectSlug}
    LIMIT 1`;
  console.log("project:", project);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
