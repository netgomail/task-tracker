import { v7 as uuidv7 } from "uuid";

export function newId(): string {
  return uuidv7();
}

/**
 * Produces a short, URL-safe slug derived from a UUID:
 *   "01HZ...".slice(0, 8) — 8 chars is enough to disambiguate within a workspace
 *   and avoids leaking sequence/time info while remaining sortable.
 */
export function shortSlug(id: string = newId()): string {
  return id.replace(/-/g, "").slice(0, 8);
}
