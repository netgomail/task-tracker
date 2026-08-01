"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { confirmDialog } from "@/components/confirm-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relative-time";

import { createCommentAction, deleteCommentAction } from "@/actions/comments";
import type { SerializedComment } from "@/actions/task-details";
import type { WorkspaceMember } from "@/services/membership";

/** Токен упоминания в теле комментария: @[Имя](userId). */
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

function renderCommentBody(body: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(body.slice(last, idx));
    parts.push(
      <span key={key++} className="font-medium text-primary">
        @{m[1]}
      </span>,
    );
    last = idx + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

/** Незавершённое упоминание перед курсором: "текст @що" → { query: "що", start: индекс "@" }. */
function activeMentionQuery(text: string, cursor: number): { query: string; start: number } | null {
  const upto = text.slice(0, cursor);
  const m = /(?:^|\s)@([^\s@]*)$/.exec(upto);
  if (!m) return null;
  return { query: m[1], start: cursor - m[1].length - 1 };
}

/**
 * В поле ввода упоминание выглядит просто как "@Имя" — без id, чтобы не
 * захламлять форму. Перед отправкой подставляем обратно @[Имя](userId) для
 * каждого выбранного через автодополнение упоминания (по порядку, первое
 * оставшееся вхождение текста "@Имя"). Если пользователь стёр/изменил текст
 * упоминания — оно просто останется обычным текстом, без уведомления.
 */
function resolveMentions(text: string, picked: { name: string; userId: string }[]): string {
  let result = text;
  let searchFrom = 0;
  for (const m of picked) {
    const needle = `@${m.name}`;
    const idx = result.indexOf(needle, searchFrom);
    if (idx === -1) continue;
    const token = `@[${m.name}](${m.userId})`;
    result = result.slice(0, idx) + token + result.slice(idx + needle.length);
    searchFrom = idx + token.length;
  }
  return result;
}

export function Comments({
  wsSlug,
  projectSlug,
  taskId,
  meId,
  comments,
  members,
  onRefresh,
}: {
  wsSlug: string;
  projectSlug: string;
  taskId: string;
  meId: string;
  comments: SerializedComment[];
  members: WorkspaceMember[];
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pickedMentions, setPickedMentions] = useState<{ name: string; userId: string }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionMatches = mention
    ? members
        .filter((m) => m.name.toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 6)
    : [];

  function selectMention(m: WorkspaceMember) {
    if (!mention) return;
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, mention.start);
    const after = draft.slice(cursor);
    // В поле показываем только "@Имя" — id не виден пользователю, но
    // остаётся привязанным через pickedMentions до отправки (resolveMentions).
    const token = `@${m.name} `;
    const next = `${before}${token}${after}`;
    setDraft(next);
    setPickedMentions((prev) => [...prev, { name: m.name, userId: m.id }]);
    setMention(null);
    const pos = before.length + token.length;
    queueMicrotask(() => textareaRef.current?.setSelectionRange(pos, pos));
    textareaRef.current?.focus();
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setDraft(value);
    const q = activeMentionQuery(value, e.target.selectionStart);
    setMention(q);
    setMentionIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMention(mentionMatches[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      add();
    }
  }

  async function add() {
    const next = draft.trim();
    if (!next) return;
    const body = resolveMentions(next, pickedMentions);
    startTransition(async () => {
      const res = await createCommentAction(wsSlug, projectSlug, taskId, body);
      if (!res.ok) toast.error(res.error);
      else {
        setDraft("");
        setMention(null);
        setPickedMentions([]);
        onRefresh();
      }
    });
  }

  async function remove(c: SerializedComment) {
    if (!(await confirmDialog({ title: "Удалить комментарий?" }))) return;
    startTransition(async () => {
      const res = await deleteCommentAction(wsSlug, projectSlug, c.id, taskId);
      if (!res.ok) toast.error(res.error);
      onRefresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Комментарии
      </h3>
      <ul className="flex flex-col gap-3">
        {comments.map((c) => (
          <li key={c.id} className="group flex gap-3">
            <Avatar className="size-7">
              {c.author.image && <AvatarImage src={c.author.image} alt={c.author.name} />}
              <AvatarFallback>{c.author.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-medium text-foreground">{c.author.name}</span>
                <span className="text-muted-foreground">{relativeTime(c.createdAt)}</span>
                {c.author.id === meId && (
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    className="ml-auto opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    Удалить
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {renderCommentBody(c.body)}
              </p>
            </div>
          </li>
        ))}
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground/70">Пока нет комментариев.</p>
        )}
      </ul>
      <div className="relative flex flex-col gap-2">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Написать комментарий… (@ — упомянуть, Ctrl/⌘+Enter — отправить)"
          rows={2}
          className="min-h-16 text-sm"
        />
        {mention && mentionMatches.length > 0 && (
          <ul className="absolute bottom-full left-0 z-10 mb-1 w-56 rounded-md border border-border bg-popover p-1 text-sm shadow-md">
            {mentionMatches.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMention(m);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1 text-left",
                    i === mentionIndex ? "bg-accent" : "hover:bg-accent",
                  )}
                >
                  <Avatar className="size-5">
                    {m.image && <AvatarImage src={m.image} alt={m.name} />}
                    <AvatarFallback className="text-[10px]">
                      {m.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button size="sm" onClick={add} disabled={pending || !draft.trim()}>
            Отправить
          </Button>
        </div>
      </div>
    </section>
  );
}
