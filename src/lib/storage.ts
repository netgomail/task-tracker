import "server-only";

import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * StorageDriver — абстракция над физическим хранилищем файлов.
 * Контракт: storage_key — относительный путь, который драйвер сам мапит на
 * свой backing store. UI/сервисы не знают про FS / S3 / etc.
 *
 * Замена реализации (например на S3) — отдельный класс без правок остального
 * кода.
 */
export interface StorageDriver {
  /** Сохраняет байты и возвращает storage_key. */
  put(parts: { workspaceId: string; taskId: string; ext: string; data: Buffer }): Promise<string>;
  /** Возвращает поток для чтения. Бросает, если файла нет. */
  read(storageKey: string): Promise<ReadStream>;
  /** Прочитать файл целиком в Buffer. Удобно при размерах ≤ нескольких МБ. */
  readAll(storageKey: string): Promise<Buffer>;
  /** Удаляет файл. Молча игнорит ENOENT — orphan-safe. */
  delete(storageKey: string): Promise<void>;
  /** Размер файла в байтах (для целостности после загрузки). */
  size(storageKey: string): Promise<number>;
}

const ATTACHMENTS_ROOT = path.resolve(process.cwd(), "data", "attachments");

/** Синтетический workspaceId-неймспейс для аватаров пользователей (put/readAll делят storageKey на две части, реальный workspace тут ни при чём). */
export const AVATAR_STORAGE_NAMESPACE = "_avatars";

function sanitizeExt(ext: string): string {
  // Допускаем только буквы/цифры; ограничиваем длину. UUID + чистое расширение
  // = path traversal невозможен (никаких `..` / `/` не пропустим).
  return ext.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase();
}

function isWithinRoot(absPath: string): boolean {
  const rel = path.relative(ATTACHMENTS_ROOT, absPath);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

export class LocalStorageDriver implements StorageDriver {
  async put({
    workspaceId,
    taskId,
    ext,
    data,
  }: {
    workspaceId: string;
    taskId: string;
    ext: string;
    data: Buffer;
  }): Promise<string> {
    const safeExt = sanitizeExt(ext);
    const uuid = crypto.randomUUID();
    const filename = safeExt ? `${uuid}.${safeExt}` : uuid;
    const key = path.posix.join(workspaceId, taskId, filename);
    const abs = path.join(ATTACHMENTS_ROOT, workspaceId, taskId, filename);
    if (!isWithinRoot(abs)) throw new Error("Invalid storage path");
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, data, { flag: "wx" });
    return key;
  }

  async read(storageKey: string): Promise<ReadStream> {
    const abs = path.join(ATTACHMENTS_ROOT, storageKey);
    if (!isWithinRoot(abs)) throw new Error("Invalid storage path");
    await stat(abs);
    return createReadStream(abs);
  }

  async readAll(storageKey: string): Promise<Buffer> {
    const abs = path.join(ATTACHMENTS_ROOT, storageKey);
    if (!isWithinRoot(abs)) throw new Error("Invalid storage path");
    return readFile(abs);
  }

  async delete(storageKey: string): Promise<void> {
    const abs = path.join(ATTACHMENTS_ROOT, storageKey);
    if (!isWithinRoot(abs)) throw new Error("Invalid storage path");
    try {
      await unlink(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }

  async size(storageKey: string): Promise<number> {
    const abs = path.join(ATTACHMENTS_ROOT, storageKey);
    if (!isWithinRoot(abs)) throw new Error("Invalid storage path");
    const s = await stat(abs);
    return s.size;
  }
}

export const storage: StorageDriver = new LocalStorageDriver();
