import { sqlite } from "@/db/client";

const userId = "XlDt9CeSlKoR3vtXh8FC0ns0eTw67bSO";
const wsSlug = "komanda-produkta-019e4fac";
const projectSlug = "019e4fb4";

const ws = sqlite
  .prepare(
    `SELECT o.id AS workspaceId, o.name, m.role
     FROM organization o
     JOIN member m ON m.organization_id = o.id
     WHERE o.slug = ? AND m.user_id = ?
     LIMIT 1`,
  )
  .get(wsSlug, userId);
console.log("ws:", ws);
if (!ws) process.exit(1);
const wsId = (ws as { workspaceId: string }).workspaceId;

const project = sqlite
  .prepare(
    `SELECT p.id, p.slug, p.archived_at, b.id AS boardId
     FROM projects p
     INNER JOIN boards b ON b.project_id = p.id
     WHERE p.workspace_id = ? AND p.slug = ?
     LIMIT 1`,
  )
  .get(wsId, projectSlug);
console.log("project:", project);
