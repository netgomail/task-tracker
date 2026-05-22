import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Returns a key that sorts strictly between `a` and `b` lexicographically.
 * Either bound can be null (open).
 *   keyBetween(null, null) → "a0"
 *   keyBetween("a0", null) → "a1"
 *   keyBetween(null, "a0") → "Zz"
 *   keyBetween("a0", "a1") → "a0V"
 */
export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}

/**
 * Generates N keys strictly between `a` and `b`. Cheaper than calling
 * keyBetween N times in a row when inserting a batch (e.g. default columns).
 */
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  return generateNKeysBetween(a, b, n);
}
