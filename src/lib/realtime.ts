import "server-only";

/**
 * In-memory pub/sub скелет для realtime-инвалидации доски.
 *
 * Назначение — минимальный шаг к multiplayer: action на сервере вызывает
 * notifyBoard(boardId), и все клиенты, открывшие /api/stream/[boardId],
 * получают пинок «перечитай данные». Никакого CRDT, presence, диффов —
 * только сигнал об инвалидации. Расширим, когда понадобится.
 *
 * Ограничения in-memory pub/sub:
 *   - живёт только в одном Node-процессе. Если будет несколько инстансов
 *     приложения, нужен внешний broker (Redis pubsub, Postgres LISTEN и т.п.).
 *     Для текущего one-process сетапа на SQLite это не проблема.
 *
 * Singleton через globalThis:
 *   - В dev-режиме Next (Turbopack) роут-хендлеры и Server Actions могут
 *     получать разные инстансы модуля. Если Map хранить как module-local,
 *     подписчик и notifyBoard оказываются в разных мирах — сообщение в пустоту.
 *     globalThis — общий для всех инстансов в одном процессе.
 */

type Sender = (payload: string) => void;

declare global {
  var __taskTrackerRealtime: Map<string, Set<Sender>> | undefined;
}

const subscribers: Map<string, Set<Sender>> =
  globalThis.__taskTrackerRealtime ?? new Map<string, Set<Sender>>();
globalThis.__taskTrackerRealtime = subscribers;

export function subscribe(boardId: string, send: Sender): () => void {
  let set = subscribers.get(boardId);
  if (!set) {
    set = new Set();
    subscribers.set(boardId, set);
  }
  set.add(send);
  return () => {
    const current = subscribers.get(boardId);
    if (!current) return;
    current.delete(send);
    if (current.size === 0) subscribers.delete(boardId);
  };
}

/**
 * Рассылает «invalidate» подписчикам данной доски. Безопасна вне зависимости
 * от того, есть подписчики или нет — если никого нет, ничего не делает.
 */
export function notifyBoard(boardId: string): void {
  const set = subscribers.get(boardId);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify({ type: "invalidate", boardId, at: Date.now() })}\n\n`;
  for (const send of set) {
    try {
      send(payload);
    } catch {
      // Сломанные подписки очистятся в route handler через unsubscribe.
    }
  }
}
