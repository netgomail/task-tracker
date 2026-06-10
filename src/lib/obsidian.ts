/**
 * Ссылка на заметку Obsidian, привязанную к задаче (`tasks.obsidian_path`).
 * Без параметра `vault` Obsidian открывает последнее активное хранилище;
 * чтобы целиться в конкретное, задай NEXT_PUBLIC_OBSIDIAN_VAULT (имя vault'а)
 * на этапе сборки.
 */
export function obsidianNoteUri(path: string): string {
  const vault = process.env.NEXT_PUBLIC_OBSIDIAN_VAULT;
  const file = encodeURIComponent(path.replace(/\.md$/, ""));
  return vault
    ? `obsidian://open?vault=${encodeURIComponent(vault)}&file=${file}`
    : `obsidian://open?file=${file}`;
}
