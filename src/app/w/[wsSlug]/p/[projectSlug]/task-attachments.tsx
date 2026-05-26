"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileIcon, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { deleteAttachmentAction } from "@/actions/attachments";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ATTACHMENT_LIMITS } from "@/lib/limits";
import type { SerializedAttachment } from "@/actions/task-details";

export function TaskAttachments({
  wsSlug,
  taskId,
  attachments,
  meId,
  canDeleteAny,
  onRefresh,
}: {
  wsSlug: string;
  taskId: string;
  attachments: SerializedAttachment[];
  meId: string;
  canDeleteAny: boolean;
  onRefresh: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [, startTransition] = useTransition();

  const totalBytes = attachments.reduce((acc, a) => acc + a.sizeBytes, 0);

  async function uploadFile(file: File) {
    if (file.size > ATTACHMENT_LIMITS.maxFileBytes) {
      toast.error(`Файл больше ${ATTACHMENT_LIMITS.maxFileBytes / 1024 / 1024} МБ`);
      return;
    }
    const form = new FormData();
    form.set("taskId", taskId);
    form.set("file", file);
    setUploading(true);
    try {
      const res = await fetch("/api/attachments", { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text();
        toast.error(text || `Ошибка загрузки (${res.status})`);
        return;
      }
      toast.success("Файл загружен");
      onRefresh();
    } finally {
      setUploading(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      await uploadFile(f);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    uploadFiles(files);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    uploadFiles(files);
  }

  function onDelete(att: SerializedAttachment) {
    if (!window.confirm(`Удалить файл «${att.filename}»?`)) return;
    startTransition(async () => {
      const res = await deleteAttachmentAction(wsSlug, att.id);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Файл удалён");
        onRefresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="size-3.5 text-muted-foreground" />
          Вложения
          <span className="text-xs text-muted-foreground">({attachments.length})</span>
        </h3>
        <span className="text-xs text-muted-foreground">
          {formatSize(totalBytes)} / {formatSize(ATTACHMENT_LIMITS.maxPerTaskBytes)}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-4 text-center transition-colors",
          dragOver
            ? "border-foreground bg-muted"
            : "border-border bg-muted/30",
          uploading && "opacity-60",
        )}
      >
        <Upload className="size-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Перетащите файл сюда или{" "}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sky-600 hover:underline dark:text-sky-400"
            disabled={uploading}
          >
            выберите
          </button>
        </p>
        <p className="text-[10px] text-muted-foreground">
          До {ATTACHMENT_LIMITS.maxFileBytes / 1024 / 1024} МБ · картинки, PDF, текст, zip, json
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onPick}
          accept="image/*,application/pdf,text/*,application/zip,application/json"
        />
      </div>

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((a) => (
            <AttachmentItem
              key={a.id}
              att={a}
              canDelete={canDeleteAny || a.uploadedBy.id === meId}
              onDelete={() => onDelete(a)}
            />
          ))}
        </ul>
      )}

      {uploading && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Загружаем…
        </p>
      )}
    </div>
  );
}

function AttachmentItem({
  att,
  canDelete,
  onDelete,
}: {
  att: SerializedAttachment;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const isImage = att.mimeType.startsWith("image/");
  const url = `/api/files/${att.id}`;
  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-background p-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground"
        title="Открыть"
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={att.filename} className="size-full object-cover" />
        ) : (
          <FileIcon className="size-4" />
        )}
      </a>
      <div className="flex min-w-0 flex-1 flex-col">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-sm font-medium hover:underline"
        >
          {att.filename}
        </a>
        <span className="text-[11px] text-muted-foreground">
          {formatSize(att.sizeBytes)} · {att.uploadedBy.name} · {relativeTime(att.createdAt)}
        </span>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button asChild size="icon-sm" variant="ghost" title="Скачать">
          <a href={`${url}?download=1`}>
            {isImage ? <ImageIcon className="size-3.5" /> : <Download className="size-3.5" />}
          </a>
        </Button>
        {canDelete && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onDelete}
            title="Удалить"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "только что";
  if (diff < hour) return `${Math.floor(diff / min)} мин назад`;
  if (diff < day) return `${Math.floor(diff / hour)} ч назад`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} дн назад`;
  return d.toLocaleDateString("ru", { day: "2-digit", month: "short" });
}
