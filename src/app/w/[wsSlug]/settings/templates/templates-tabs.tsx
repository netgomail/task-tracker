"use client";

import { useState } from "react";
import { FileText, Layers } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LabelRow } from "@/services/labels";
import { TemplatesManager } from "./templates-manager";
import { SetsManager, type SetView } from "./sets-manager";
import type { TaskPriority, TaskType } from "@/domain/types";
import type { LabelColorSlug } from "@/lib/colors";

type TemplateView = {
  id: string;
  name: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  color: LabelColorSlug;
  labelIds: string[];
  subtasks: string[];
};

type Tab = "tasks" | "sets";

export function TemplatesTabs({
  wsSlug,
  templates,
  labels,
  sets,
}: {
  wsSlug: string;
  templates: TemplateView[];
  labels: LabelRow[];
  sets: SetView[];
}) {
  const [tab, setTab] = useState<Tab>("tasks");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")} Icon={FileText}>
          Шаблоны задач
          <Count n={templates.length} />
        </TabButton>
        <TabButton active={tab === "sets"} onClick={() => setTab("sets")} Icon={Layers}>
          Комплекты тем
          <Count n={sets.length} />
        </TabButton>
      </div>

      {tab === "tasks" ? (
        <TemplatesManager wsSlug={wsSlug} initialTemplates={templates} labels={labels} />
      ) : (
        <SetsManager wsSlug={wsSlug} sets={sets} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {n}
    </span>
  );
}
