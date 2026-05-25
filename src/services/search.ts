import "server-only";

import { sqlite } from "@/db";

/**
 * Превращает пользовательскую строку в безопасный FTS5-запрос:
 * каждый токен → префиксный фразовый поиск `"token"*`. Так пользователь не может
 * сломать синтаксис FTS5 и одновременно получает удобный «type-as-you-search».
 */
function buildFtsQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(" ");
}

/**
 * Возвращает id задач workspace/project, попавших в FTS5-индекс по строке `q`.
 * Если строка пустая или содержит только пробелы — возвращает null,
 * показывая вызывающему «фильтр не применялся».
 */
export function searchTaskIds(
  workspaceId: string,
  projectId: string,
  q: string,
): string[] | null {
  const fts = buildFtsQuery(q);
  if (!fts) return null;
  const rows = sqlite
    .prepare<[string, string, string], { id: string }>(
      `SELECT t.id
       FROM tasks t
       JOIN tasks_fts f ON f.rowid = t.rowid
       WHERE tasks_fts MATCH ?
         AND t.workspace_id = ?
         AND t.project_id = ?`,
    )
    .all(fts, workspaceId, projectId);
  return rows.map((r) => r.id);
}
