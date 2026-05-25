/**
 * In-memory rate limiter — без внешних зависимостей.
 * Подходит для single-process Node.js (Next.js dev/prod standalone).
 * Для горизонтального масштабирования заменить на Redis (Upstash).
 *
 * Алгоритм: sliding window — считаем попытки за последние `windowMs` мс.
 */

type Entry = {
  attempts: number;
  windowStart: number;
};

const store = new Map<string, Entry>();

// Очистка устаревших записей каждые 5 минут
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.windowStart > 15 * 60 * 1000) {
        store.delete(key);
      }
    }
  },
  5 * 60 * 1000,
);

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * @param key       Идентификатор (IP-адрес или `ip:action`)
 * @param limit     Максимум попыток за окно (по умолчанию 5)
 * @param windowMs  Длина окна в мс (по умолчанию 15 минут)
 */
export function checkRateLimit(
  key: string,
  limit = 5,
  windowMs = 15 * 60 * 1000,
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    // Новое окно
    store.set(key, { attempts: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.attempts >= limit) {
    const retryAfterSeconds = Math.ceil(
      (entry.windowStart + windowMs - now) / 1000,
    );
    return { allowed: false, retryAfterSeconds };
  }

  entry.attempts += 1;
  return { allowed: true };
}

/**
 * Извлекает IP из заголовков Next.js Request (Edge / Node.js).
 * Учитывает reverse-proxy (x-forwarded-for).
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
