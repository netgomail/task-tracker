/**
 * Санитизация пользовательского текста перед сохранением в БД.
 *
 * Текущий рендеринг в приложении использует React (автоматическое экранирование),
 * поэтому прямого XSS нет. Санитизация — защита в глубину на случай добавления
 * Markdown/HTML-рендеринга в будущем.
 *
 * Не используем внешние библиотеки (DOMPurify/sanitize-html) — они нужны
 * только при реальном HTML-рендеринге. Здесь достаточно strip-тегов.
 */

const HTML_TAG_RE = /<[^>]*>/g;
const NULL_BYTE_RE = /\0/g;

/**
 * Удаляет HTML-теги и null-байты из строки.
 * Безопасно для plain-text полей (title, description, comment body).
 */
export function stripHtml(input: string): string {
  return input.replace(HTML_TAG_RE, "").replace(NULL_BYTE_RE, "");
}

/**
 * Zod-трансформ для текстовых полей. Подключается через .transform(sanitizeText).
 *
 * Пример:
 *   const TitleSchema = z.string().trim().min(1).max(500).transform(sanitizeText);
 */
export function sanitizeText(value: string): string {
  return stripHtml(value);
}
