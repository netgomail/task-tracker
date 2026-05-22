"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Подписывается на /api/stream/[boardId] (SSE) и на каждое сообщение «invalidate»
 * вызывает router.refresh(). Это перечитает RSC-payload и подтянет свежие данные
 * без перезагрузки страницы.
 *
 * Скелет: пока обработчик один — «refresh». Когда понадобится presence или
 * частичные апдейты, расширим типизированными событиями.
 */
export function BoardLiveSync({ boardId }: { boardId: string }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const es = new EventSource(`/api/stream/${boardId}`);
    if (process.env.NODE_ENV !== "production") {
      console.debug("[live] open", boardId);
    }
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string };
        if (process.env.NODE_ENV !== "production") {
          console.debug("[live] message", data);
        }
        if (data.type === "invalidate") {
          router.refresh();
        }
      } catch {
        // игнорируем сломанные сообщения
      }
    };
    es.onerror = (e) => {
      // EventSource сам ретраит по retry: из стрима. Просто молчим.
      if (process.env.NODE_ENV !== "production") {
        console.debug("[live] error", e);
      }
    };
    return () => {
      es.close();
    };
  }, [boardId, router]);

  return null;
}
