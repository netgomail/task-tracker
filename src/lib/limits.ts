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

// Текстовые типы перечислены явно: префикс "text/" пропускал text/html —
// stored XSS на origin приложения при открытии вложения.
const TEXT_MIME_ALLOWLIST = new Set<string>(["text/plain", "text/csv", "text/markdown"]);

export function isAllowedMime(mime: string): boolean {
  return MIME_ALLOWLIST.has(mime) || TEXT_MIME_ALLOWLIST.has(mime);
}

/**
 * Типы, которые безопасно отдавать с Content-Disposition: inline (превью).
 * Только растровые картинки и PDF: они не исполняют скрипты на нашем origin.
 * SVG/HTML/прочее — всегда attachment.
 */
const INLINE_SAFE_MIMES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "application/pdf",
]);

export function isInlineSafeMime(mime: string): boolean {
  return INLINE_SAFE_MIMES.has(mime);
}

// Расширение → допустимые MIME. Ловит подмену вида «report.html + text/plain».
// Расширения не из карты (включая пустое) допустимы: сам MIME уже прошёл allowlist,
// а исполняемые браузером типы (html/svg/xml/js) перечислены здесь и требуют
// MIME, которого нет в allowlist, — то есть всегда отклоняются.
const EXT_EXPECTED_MIMES: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  bmp: ["image/bmp"],
  tif: ["image/tiff"],
  tiff: ["image/tiff"],
  heic: ["image/heic"],
  heif: ["image/heif"],
  pdf: ["application/pdf"],
  zip: ["application/zip", "application/x-zip-compressed"],
  json: ["application/json"],
  txt: ["text/plain"],
  log: ["text/plain"],
  csv: ["text/csv", "text/plain"],
  md: ["text/markdown", "text/plain"],
  markdown: ["text/markdown", "text/plain"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  odt: ["application/vnd.oasis.opendocument.text"],
  ods: ["application/vnd.oasis.opendocument.spreadsheet"],
  odp: ["application/vnd.oasis.opendocument.presentation"],
  rtf: ["application/rtf", "text/rtf"],
  // Исполняемые браузером типы: их ожидаемые MIME отсутствуют в allowlist,
  // так что файл с таким расширением не пройдёт ни под каким заявленным типом.
  html: ["text/html"],
  htm: ["text/html"],
  xhtml: ["application/xhtml+xml"],
  svg: ["image/svg+xml"],
  xml: ["application/xml"],
  js: ["text/javascript"],
  mjs: ["text/javascript"],
};

export function isExtensionConsistent(filename: string, mime: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!ext || ext === filename.toLowerCase()) return true; // без расширения
  const expected = EXT_EXPECTED_MIMES[ext];
  if (!expected) return true; // незнакомое расширение — решает MIME-allowlist
  return expected.includes(mime);
}
