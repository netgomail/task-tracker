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
  // Подписчики уровня workspace — Obsidian-плагин слушает изменения всех досок
  // пространства, чтобы вытянуть /api/obsidian/changes.
  var __taskTrackerWsRealtime: Map<string, Set<Sender>> | undefined;
  // boardId → workspaceId: мост, чтобы notifyBoard заодно будил workspace-канал
  // без обращения к БД (realtime — чистый in-memory pub/sub).
  var __taskTrackerBoardWs: Map<string, string> | undefined;
}

const subscribers: Map<string, Set<Sender>> =
  globalThis.__taskTrackerRealtime ?? new Map<string, Set<Sender>>();
globalThis.__taskTrackerRealtime = subscribers;

const wsSubscribers: Map<string, Set<Sender>> =
  globalThis.__taskTrackerWsRealtime ?? new Map<string, Set<Sender>>();
globalThis.__taskTrackerWsRealtime = wsSubscribers;

const boardWorkspace: Map<string, string> =
  globalThis.__taskTrackerBoardWs ?? new Map<string, string>();
globalThis.__taskTrackerBoardWs = boardWorkspace;

function subscribeTo(map: Map<string, Set<Sender>>, key: string, send: Sender): () => void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(send);
  return () => {
    const current = map.get(key);
    if (!current) return;
    current.delete(send);
    if (current.size === 0) map.delete(key);
  };
}

function fanout(set: Set<Sender> | undefined, payload: string): void {
  if (!set || set.size === 0) return;
  for (const send of set) {
    try {
      send(payload);
    } catch {
      // Сломанные подписки очистятся в route handler через unsubscribe.
    }
  }
}

export function subscribe(boardId: string, send: Sender): () => void {
  return subscribeTo(subscribers, boardId, send);
}

/** Подписка Obsidian-плагина на изменения всего пространства. */
export function subscribeWorkspace(workspaceId: string, send: Sender): () => void {
  return subscribeTo(wsSubscribers, workspaceId, send);
}

/**
 * Регистрирует принадлежность доски пространству, чтобы notifyBoard заодно
 * будил workspace-канал. Вызывается из мест, где известны оба id (board-стрим,
 * actions с авторизацией). Дёшево и идемпотентно.
 */
export function bindBoardWorkspace(boardId: string, workspaceId: string): void {
  boardWorkspace.set(boardId, workspaceId);
}

/** Будит подписчиков пространства (Obsidian-плагин → дёрнуть /changes). */
export function notifyWorkspace(workspaceId: string): void {
  const payload = `data: ${JSON.stringify({ type: "sync", workspaceId, at: Date.now() })}\n\n`;
  fanout(wsSubscribers.get(workspaceId), payload);
}

/**
 * Рассылает «invalidate» подписчикам доски и (если известна привязка) будит
 * workspace-канал. Безопасна при отсутствии подписчиков.
 */
export function notifyBoard(boardId: string): void {
  const payload = `data: ${JSON.stringify({ type: "invalidate", boardId, at: Date.now() })}\n\n`;
  fanout(subscribers.get(boardId), payload);
  const workspaceId = boardWorkspace.get(boardId);
  if (workspaceId) notifyWorkspace(workspaceId);
}
