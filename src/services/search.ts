import "server-only";

import { client } from "@/db";

/**
 * Превращает пользовательскую строку в безопасный Postgres-`tsquery`:
 * каждый токен → префиксный матч `token:*`, токены объединяются через `&`.
 * Не-буквенно-цифровые символы выкидываем, чтобы пользователь не мог сломать
 * синтаксис tsquery и при этом сохранялся удобный «type-as-you-search».
 */
export function buildTsQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter(Boolean)
    .map((t) => `${t}:*`)
    .join(" & ");
}

/**
 * Возвращает id задач workspace/project, попавших в FTS-индекс по строке `q`.
 * Если строка пустая или содержит только пробелы — возвращает null,
 * показывая вызывающему «фильтр не применялся».
 */
export async function searchTaskIds(
  workspaceId: string,
  projectId: string,
  q: string,
): Promise<string[] | null> {
  const tsq = buildTsQuery(q);
  if (!tsq) return null;
  const rows = await client<{ id: string }[]>`
    SELECT t.id
    FROM tasks t
    WHERE t.search_vector @@ to_tsquery('simple', ${tsq})
      AND t.workspace_id = ${workspaceId}
      AND t.project_id = ${projectId}`;
  return rows.map((r) => r.id);
}
