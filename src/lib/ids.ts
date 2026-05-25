import { v7 as uuidv7 } from "uuid";

export function newId(): string {
  return uuidv7();
}

/**
 * Produces a short, URL-safe slug derived from a UUID.
 * Takes the first 8 chars (timestamp-based) — used where the caller controls
 * uniqueness via a random suffix (e.g. workspace slugs).
 */
export function shortSlug(id: string = newId()): string {
  return id.replace(/-/g, "").slice(0, 8);
}

/**
 * 8-char slug from the random portion of a UUIDv7 (bytes 8-11, positions 16-23
 * in the de-dashed string). These bits are random, not timestamp-derived, so
 * two IDs generated in the same millisecond still produce different slugs.
 * Use for project slugs and any entity where uniqueness within a workspace matters.
 */
export function randomSlug(id: string = newId()): string {
  return id.replace(/-/g, "").slice(16, 24);
}
