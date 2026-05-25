"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Tag,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NewProjectForm } from "./new-project-form";
import { NewWorkspaceForm } from "@/app/workspaces/new-workspace-form";
import type { Workspace } from "@/services/workspaces";
import type { ProjectSummary } from "@/services/projects";

const WS_PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#0ea5e9",
];

function wsColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffff;
  return WS_PALETTE[Math.abs(h) % WS_PALETTE.length];
}

export interface WsWithProjects {
  ws: Workspace;
  projects: ProjectSummary[];
}

interface AppSidebarProps {
  wsSlug: string;
  wsItems: WsWithProjects[];
}

export function AppSidebar({ wsSlug, wsItems }: AppSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([wsSlug]));
  const [newProjectWsSlug, setNewProjectWsSlug] = useState<string | null>(null);
  const [newWsOpen, setNewWsOpen] = useState(false);

  const projectSlug = pathname.match(/\/p\/([^/]+)/)?.[1];

  function toggleWs(slug: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  // ── Collapsed (icons only) ─────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-2">
        <button
          onClick={() => setCollapsed(false)}
          title="Развернуть"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>

        <div className="my-1 h-px w-7 bg-border" />

        {wsItems.map(({ ws }) => {
          const isActive = ws.slug === wsSlug;
          const color = wsColor(ws.name);
          return (
            <Link
              key={ws.id}
              href={`/w/${ws.slug}`}
              title={ws.name}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[11px] font-bold text-white transition-opacity"
              style={{
                background: color,
                opacity: isActive ? 1 : 0.55,
              }}
            >
              {ws.name.charAt(0).toUpperCase()}
            </Link>
          );
        })}

        <div className="mt-auto flex flex-col items-center gap-1">
          <Link
            href={`/w/${wsSlug}/settings/labels`}
            title="Метки"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Tag className="h-4 w-4" />
          </Link>
          <Link
            href={`/w/${wsSlug}/settings`}
            title="Настройки"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </aside>
    );
  }

  // ── Expanded ───────────────────────────────────────────────────────────────
  return (
    <>
      <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-sidebar">
        {/* Toggle collapse */}
        <div className="flex h-10 items-center justify-end px-2">
          <button
            onClick={() => setCollapsed(true)}
            title="Свернуть"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-3 h-px bg-border" />

        {/* Workspace + Projects tree */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {wsItems.map(({ ws, projects }) => {
            const isCurrentWs = ws.slug === wsSlug;
            const isOpen = expanded.has(ws.slug);
            const color = wsColor(ws.name);

            return (
              <div key={ws.id} className="mb-0.5">
                {/* Workspace row */}
                <div
                  className="group flex cursor-pointer select-none items-center gap-1 rounded-md px-1 py-1.5 hover:bg-sidebar-accent"
                  onClick={() => toggleWs(ws.slug)}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                    style={{ background: color }}
                  >
                    {ws.name.charAt(0).toUpperCase()}
                  </span>
                  <Link
                    href={`/w/${ws.slug}`}
                    onClick={(e) => e.stopPropagation()}
                    className={`flex-1 truncate text-sm font-medium ${
                      isCurrentWs
                        ? "text-sidebar-foreground"
                        : "text-muted-foreground group-hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    {ws.name}
                  </Link>
                </div>

                {/* Projects list */}
                {isOpen && (
                  <div className="mb-1 ml-5 border-l border-border pl-2">
                    {projects.length === 0 && (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground/60">
                        Нет проектов
                      </p>
                    )}
                    {projects.map((p) => {
                      const isActive = isCurrentWs && p.slug === projectSlug;
                      return (
                        <Link
                          key={p.id}
                          href={`/w/${ws.slug}/p/${p.slug}`}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                            isActive
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }`}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: p.color ?? color }}
                          />
                          <span className="truncate">{p.name}</span>
                        </Link>
                      );
                    })}
                    {isCurrentWs && (
                      <button
                        onClick={() => setNewProjectWsSlug(ws.slug)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Новый проект</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={() => setNewWsOpen(true)}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Новое пространство</span>
          </button>
        </nav>

        <div className="mx-3 h-px bg-border" />

        {/* Bottom: Settings */}
        <div className="px-2 py-2">
          <Link
            href={`/w/${wsSlug}/settings/labels`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Tag className="h-4 w-4" />
            <span>Метки</span>
          </Link>
          <Link
            href={`/w/${wsSlug}/settings`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Settings className="h-4 w-4" />
            <span>Настройки</span>
          </Link>
        </div>
      </aside>

      <Dialog
        open={newProjectWsSlug !== null}
        onOpenChange={(open) => !open && setNewProjectWsSlug(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать проект</DialogTitle>
            <DialogDescription>Введите название нового проекта.</DialogDescription>
          </DialogHeader>
          {newProjectWsSlug && (
            <NewProjectForm
              wsSlug={newProjectWsSlug}
              onSuccess={() => setNewProjectWsSlug(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={newWsOpen} onOpenChange={setNewWsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать пространство</DialogTitle>
            <DialogDescription>
              После создания вы будете перенаправлены в новое пространство.
            </DialogDescription>
          </DialogHeader>
          <NewWorkspaceForm />
        </DialogContent>
      </Dialog>
    </>
  );
}
