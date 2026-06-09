"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createSyncTokenAction, revokeSyncTokenAction } from "@/actions/sync";

export type TokenView = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type Props = {
  wsSlug: string;
  workspaceSlug: string;
  baseUrl: string;
  canManage: boolean;
  initialTokens: TokenView[];
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} скопировано`);
  } catch {
    toast.error("Не удалось скопировать");
  }
}

export function SyncTokens({ wsSlug, workspaceSlug, baseUrl, canManage, initialTokens }: Props) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  function submitCreate() {
    const next = name.trim();
    if (!next) return;
    startTransition(async () => {
      const res = await createSyncTokenAction(wsSlug, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setFreshSecret(res.secret);
      setName("");
      toast.success("Токен создан");
    });
  }

  function revoke(id: string, tokenName: string) {
    if (!confirm(`Отозвать токен «${tokenName}»? Плагин с ним перестанет синхронизироваться.`)) {
      return;
    }
    startTransition(async () => {
      const res = await revokeSyncTokenAction(wsSlug, id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Токен отозван");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Параметры подключения для плагина */}
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-medium">Параметры плагина</h2>
        <Field label="URL сервера" value={baseUrl} />
        <Field label="Пространство (workspace)" value={workspaceSlug} />
        <p className="text-xs text-muted-foreground">
          В каждой заметке-документе ОРД укажите свойство{" "}
          <code className="rounded bg-muted px-1 py-0.5">theme</code> — slug темы (проекта).
        </p>
      </section>

      {/* Свежесозданный секрет — показываем один раз */}
      {freshSecret && (
        <section className="flex flex-col gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <h2 className="flex items-center gap-2 text-base font-medium">
            <KeyRound className="size-4" /> Секрет токена
          </h2>
          <p className="text-xs text-muted-foreground">
            Скопируйте сейчас — повторно он не покажется.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-sm">
              {freshSecret}
            </code>
            <Button size="sm" variant="outline" onClick={() => copy(freshSecret, "Секрет")}>
              <Copy className="size-4" /> Копировать
            </Button>
          </div>
        </section>
      )}

      {/* Создание токена */}
      {canManage && (
        <section className="flex items-end gap-2 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="token-name">
              Новый токен
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCreate();
                  }
                }}
                placeholder="Например, MacBook Obsidian"
                maxLength={60}
                disabled={pending}
              />
              <Button onClick={submitCreate} disabled={pending || !name.trim()}>
                <Plus className="size-4" /> Создать
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Список токенов */}
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-medium">Токены</h2>
        {initialTokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет токенов.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {initialTokens.map((t) => {
              const revoked = Boolean(t.revokedAt);
              return (
                <li
                  key={t.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3",
                    revoked && "opacity-60",
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {t.name}
                      {revoked && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          отозван
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      создан {fmt(t.createdAt)} · последнее использование {fmt(t.lastUsedAt)}
                    </span>
                  </div>
                  {canManage && !revoked && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revoke(t.id, t.name)}
                      disabled={pending}
                    >
                      <Trash2 className="size-4" /> Отозвать
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-44 shrink-0 text-xs text-muted-foreground">{label}</span>
      <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-sm">{value}</code>
      <Button size="sm" variant="ghost" onClick={() => copy(value, label)}>
        <Copy className="size-4" />
      </Button>
    </div>
  );
}
