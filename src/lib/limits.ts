export const ATTACHMENT_LIMITS = {
  /** Максимальный размер одного файла в байтах. */
  maxFileBytes: 25 * 1024 * 1024,
  /** Суммарный лимит на задачу в байтах. */
  maxPerTaskBytes: 50 * 1024 * 1024,
  /** Максимальное число вложений на задачу — защита от 10 000 пустых файлов. */
  maxPerTaskCount: 30,
} as const;

const MIME_ALLOWLIST = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/zip",
  "application/json",
  "application/x-zip-compressed",
]);

const MIME_PREFIX_ALLOWLIST = ["text/"];

export function isAllowedMime(mime: string): boolean {
  if (MIME_ALLOWLIST.has(mime)) return true;
  return MIME_PREFIX_ALLOWLIST.some((p) => mime.startsWith(p));
}
