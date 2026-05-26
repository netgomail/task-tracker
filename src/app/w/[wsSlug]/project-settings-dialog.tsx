"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  getProjectSettingsAction,
  renameProjectAction,
  setProjectColorAction,
  setProjectDescriptionAction,
  type ProjectSettings,
} from "@/actions/projects";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LABEL_COLORS, type LabelColorSlug } from "@/lib/colors";
import type { FieldDef } from "@/domain/custom-fields";

import { AutomationsEditor } from "./p/[projectSlug]/automations-editor";
import { FieldsEditor } from "./p/[projectSlug]/fields-editor";

type Tab = "general" | "fields" | "automations";

export function ProjectSettingsDialog({
  wsSlug,
  projectSlug,
  open,
  onOpenChange,
}: {
  wsSlug: string;
  projectSlug: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("general");

  useEffect(() => {
    if (!open || !projectSlug) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(null);
    setLoadError(null);
    (async () => {
      const res = await getProjectSettingsAction(wsSlug, projectSlug);
      if (cancelled) return;
      if (res.ok) setSettings(res.data);
      else setLoadError(res.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectSlug, wsSlug]);

  function patch(next: Partial<ProjectSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...next } : prev));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Настройки проекта</DialogTitle>
          <DialogDescription className="sr-only">
            Имя, цвет, описание и кастомные поля проекта.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : !settings ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            <div className="flex border-b border-border">
              <TabButton active={tab === "general"} onClick={() => setTab("general")}>
                Общие
              </TabButton>
              <TabButton active={tab === "fields"} onClick={() => setTab("fields")}>
                Поля ({settings.customFields.length})
              </TabButton>
              <TabButton active={tab === "automations"} onClick={() => setTab("automations")}>
                Автоматизации ({settings.automationsContext.rules.length})
              </TabButton>
            </div>

            <div className="max-h-[65vh] overflow-y-auto pt-4">
              {tab === "general" && (
                <GeneralTab
                  wsSlug={wsSlug}
                  settings={settings}
                  onPatch={patch}
                  canEdit={settings.role === "owner" || settings.role === "admin"}
                />
              )}

              {tab === "fields" && (
                <FieldsEditor
                  wsSlug={wsSlug}
                  projectSlug={settings.slug}
                  canEdit={settings.role === "owner" || settings.role === "admin"}
                  initialFields={settings.customFields as FieldDef[] as unknown as Parameters<
                    typeof FieldsEditor
                  >[0]["initialFields"]}
                />
              )}

              {tab === "automations" && (
                <AutomationsEditor
                  wsSlug={wsSlug}
                  projectSlug={settings.slug}
                  canEdit={settings.role === "owner" || settings.role === "admin"}
                  initialRules={settings.automationsContext.rules}
                  ctx={{
                    columns: settings.automationsContext.columns,
                    labels: settings.automationsContext.labels,
                    members: settings.automationsContext.members,
                  }}
                />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function GeneralTab({
  wsSlug,
  settings,
  onPatch,
  canEdit,
}: {
  wsSlug: string;
  settings: ProjectSettings;
  onPatch: (next: Partial<ProjectSettings>) => void;
  canEdit: boolean;
}) {
  const [name, setName] = useState(settings.name);
  const [description, setDescription] = useState(settings.description ?? "");
  const [pending, startTransition] = useTransition();

  function saveName() {
    const next = name.trim();
    if (!next || next === settings.name) return;
    startTransition(async () => {
      const res = await renameProjectAction(wsSlug, settings.id, next);
      if (!res.ok) {
        toast.error(res.error);
        setName(settings.name);
      } else {
        toast.success("Имя обновлено");
        onPatch({ name: next });
      }
    });
  }

  function saveDescription() {
    const next = description.trim();
    if ((next === "" ? null : next) === (settings.description ?? null)) return;
    startTransition(async () => {
      const res = await setProjectDescriptionAction(wsSlug, settings.id, next);
      if (!res.ok) {
        toast.error(res.error);
        setDescription(settings.description ?? "");
      } else {
        onPatch({ description: next === "" ? null : next });
      }
    });
  }

  function pickColor(slug: LabelColorSlug) {
    if (slug === settings.color) return;
    startTransition(async () => {
      const res = await setProjectColorAction(wsSlug, settings.id, slug);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Цвет обновлён");
        onPatch({ color: slug });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="proj-name">
          Название
        </label>
        <Input
          id="proj-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={!canEdit || pending}
          maxLength={80}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Цвет</span>
        <div className="flex flex-wrap gap-1">
          {LABEL_COLORS.map((c) => (
            <button
              key={c.slug}
              type="button"
              disabled={!canEdit || pending}
              onClick={() => pickColor(c.slug as LabelColorSlug)}
              title={c.label}
              className={cn(
                "size-7 rounded-md border-2 transition-transform",
                settings.color === c.slug ? "border-foreground scale-110" : "border-transparent",
                (!canEdit || pending) && "cursor-not-allowed opacity-60",
              )}
              style={{ background: c.hex }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="proj-desc">
          Описание
        </label>
        <Textarea
          id="proj-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          rows={4}
          maxLength={10_000}
          placeholder="Необязательно. Краткое описание проекта."
          disabled={!canEdit || pending}
        />
      </div>

      <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <div>
          Slug: <code className="rounded bg-background px-1 py-0.5">/{settings.slug}</code>
        </div>
        <div>Ваша роль: {settings.role}</div>
      </div>

      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          У вашей роли нет прав на редактирование настроек проекта.
        </p>
      )}
    </div>
  );
}
