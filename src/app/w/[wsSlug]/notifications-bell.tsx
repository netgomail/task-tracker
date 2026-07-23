"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { relativeTime } from "@/lib/relative-time";
import type { NotificationRow } from "@/services/notifications";
import {
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/actions/notifications";

// SSE-канал будит немедленно; интервал — только подстраховка на случай
// разрыва соединения (EventSource сам ретраит, но на всякий случай).
const FALLBACK_POLL_MS = 120_000;

function describe(n: NotificationRow): string {
  const actor = n.actorName ?? "Кто-то";
  const title = n.taskTitle ?? "задаче";
  if (n.type === "task_assigned") return `${actor} назначил(а) вам задачу «${title}»`;
  if (n.type === "comment_mention") return `${actor} упомянул(а) вас в комментарии к «${title}»`;
  return `${actor}: обновление по «${title}»`;
}

export function NotificationsBell({
  wsSlug,
  initialNotifications,
  initialUnread,
}: {
  wsSlug: string;
  initialNotifications: NotificationRow[];
  initialUnread: number;
}) {
  const [items, setItems] = useState(initialNotifications);
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await listNotificationsAction(wsSlug);
      if (res.ok) {
        setItems(res.notifications);
        setUnread(res.unread);
      }
    }

    const es = new EventSource(`/api/notifications/stream?ws=${wsSlug}`);
    es.onmessage = () => {
      load();
    };
    const id = setInterval(load, FALLBACK_POLL_MS);
    return () => {
      es.close();
      clearInterval(id);
    };
  }, [wsSlug]);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      const res = await listNotificationsAction(wsSlug);
      if (res.ok) {
        setItems(res.notifications);
        setUnread(res.unread);
      }
    }
  }

  async function handleItemClick(n: NotificationRow) {
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date() } : x)));
      setUnread((c) => Math.max(0, c - 1));
      await markNotificationReadAction(n.id);
    }
    setOpen(false);
  }

  async function handleMarkAllRead() {
    setItems((prev) => prev.map((x) => (x.readAt ? x : { ...x, readAt: new Date() })));
    setUnread(0);
    await markAllNotificationsReadAction(wsSlug);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Уведомления"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Уведомления</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Прочитать всё
            </button>
          )}
        </div>
        <ul className="flex max-h-96 flex-col overflow-y-auto">
          {items.map((n) => {
            const href =
              n.taskId && n.projectSlug ? `/w/${wsSlug}/p/${n.projectSlug}?task=${n.taskId}` : null;
            const content = (
              <>
                <p className="text-sm leading-snug">{describe(n)}</p>
                <span className="text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
              </>
            );
            const rowClass = `flex flex-col gap-0.5 border-b border-border px-3 py-2.5 last:border-0 hover:bg-accent ${
              n.readAt ? "" : "bg-accent/40"
            }`;
            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} onClick={() => handleItemClick(n)} className={`block ${rowClass}`}>
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={`w-full text-left ${rowClass}`}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">Пока пусто</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
