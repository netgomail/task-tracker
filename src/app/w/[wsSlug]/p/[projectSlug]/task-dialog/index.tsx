"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { getTaskDetailsAction, type TaskDetailsResult } from "@/actions/task-details";

import { TaskAttachments } from "../task-attachments";
import { Activity, ContentTabButton } from "./activity";
import { Comments } from "./comments";
import { Description } from "./description";
import { Header } from "./header";
import { TaskLinksSection } from "./links";
import { Sidebar } from "./sidebar";
import { Subtasks } from "./subtasks";

type Props = {
  wsSlug: string;
  projectSlug: string;
  taskId: string;
  onClose: () => void;
};

export function TaskDialog({ wsSlug, projectSlug, taskId, onClose }: Props) {
  const [details, setDetails] = useState<Extract<TaskDetailsResult, { ok: true }> | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [contentTab, setContentTab] = useState<"comments" | "history">("comments");

  // Reset details when taskId changes via render-phase update.
  const [prevTaskId, setPrevTaskId] = useState(taskId);
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId);
    setDetails(null);
    setLoadedFor(null);
    setContentTab("comments");
  }

  async function reload() {
    const res = await getTaskDetailsAction(wsSlug, projectSlug, taskId);
    if (res.ok) setDetails(res);
    else toast.error(res.error);
    setLoadedFor(taskId);
  }

  useEffect(() => {
    // Fetch task details whenever the dialog targets a different task.
    // The setState inside reload() is the canonical "sync with server" case.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    // reload() captures the latest wsSlug/projectSlug/taskId via closures and is
    // intentionally not depended on — re-running on taskId change is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const loading = loadedFor !== taskId;
  const task = details?.task;

  function refresh() {
    startTransition(reload);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton
        className="max-w-3xl gap-0 p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">Карточка задачи</DialogTitle>
        <DialogDescription className="sr-only">
          Редактирование задачи, подзадач и комментариев.
        </DialogDescription>
        {loading || !task || !details ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Загрузка…
          </div>
        ) : (
          <div className="grid max-h-[80vh] grid-cols-1 sm:grid-cols-[1fr_220px]">
            <div className="flex min-h-0 flex-col overflow-y-auto p-6">
              <Header
                wsSlug={wsSlug}
                projectSlug={projectSlug}
                task={task}
                pending={pending}
                onRefresh={refresh}
              />
              <Separator className="my-4" />
              <Description
                wsSlug={wsSlug}
                projectSlug={projectSlug}
                task={task}
                onRefresh={refresh}
              />
              <Separator className="my-4" />
              <Subtasks
                wsSlug={wsSlug}
                projectSlug={projectSlug}
                taskId={task.id}
                subtasks={details.subtasks}
                onRefresh={refresh}
              />
              <Separator className="my-4" />
              <TaskLinksSection
                wsSlug={wsSlug}
                taskId={task.id}
                links={details.links}
                onRefresh={refresh}
              />
              <Separator className="my-4" />
              <TaskAttachments
                wsSlug={wsSlug}
                taskId={task.id}
                attachments={details.attachments}
                meId={details.me.id}
                canDeleteAny={details.me.role === "admin" || details.me.role === "owner"}
                onRefresh={refresh}
              />
              <Separator className="my-4" />
              <div className="flex border-b border-border">
                <ContentTabButton
                  active={contentTab === "comments"}
                  onClick={() => setContentTab("comments")}
                  count={details.comments.length}
                >
                  Комментарии
                </ContentTabButton>
                <ContentTabButton
                  active={contentTab === "history"}
                  onClick={() => setContentTab("history")}
                  count={details.activity.length}
                >
                  История
                </ContentTabButton>
              </div>
              <div className="pt-4">
                {contentTab === "comments" && (
                  <Comments
                    wsSlug={wsSlug}
                    projectSlug={projectSlug}
                    taskId={task.id}
                    meId={details.me.id}
                    comments={details.comments}
                    members={details.members}
                    onRefresh={refresh}
                  />
                )}
                {contentTab === "history" && (
                  <Activity activity={details.activity} />
                )}
              </div>
            </div>
            <aside className="hidden flex-col gap-4 border-l border-border bg-muted/30 p-4 sm:flex">
              <Sidebar
                wsSlug={wsSlug}
                projectSlug={projectSlug}
                task={task}
                labels={details.labels}
                workspaceLabels={details.workspaceLabels}
                members={details.members}
                assignee={details.assignee}
                customFields={details.customFields}
                customFieldValues={details.customFieldValues}
                pending={pending}
                onRefresh={refresh}
                onClose={onClose}
              />
            </aside>
          </div>
        )}
        {!loading && task && details && (
          <div className="flex justify-end border-t border-border bg-muted/30 px-6 py-3">
            <Button onClick={onClose}>Сохранить</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
