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
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/zip",
  "application/json",
  "application/x-zip-compressed",
  // Office-документы (Word/Excel/PowerPoint) — для ОРД, журналов, инструкций.
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // OpenDocument (LibreOffice/OnlyOffice).
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
]);

const MIME_PREFIX_ALLOWLIST = ["text/"];

export function isAllowedMime(mime: string): boolean {
  if (MIME_ALLOWLIST.has(mime)) return true;
  return MIME_PREFIX_ALLOWLIST.some((p) => mime.startsWith(p));
}
