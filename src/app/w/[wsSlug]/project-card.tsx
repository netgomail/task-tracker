"use client";

import Link from "next/link";
import { useTransition } from "react";
import { MoreHorizontal, Trash2, Archive } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { colorHex, isLabelColor } from "@/lib/colors";
import { archiveProjectAction, deleteProjectAction } from "@/actions/projects";

type Props = {
  wsSlug: string;
  id: string;
  slug: string;
  name: string;
  color: string;
};

export function ProjectCard({ wsSlug, id, slug, name, color }: Props) {
  const [pending, startTransition] = useTransition();
  const bar = isLabelColor(color) ? colorHex(color) : "#64748b";

  function onArchive() {
    startTransition(async () => {
      const res = await archiveProjectAction(wsSlug, id);
      if (!res.ok) toast.error(res.error);
      else
        toast.success(`Проект «${name}» в архиве`, {
          action: {
            label: "Открыть архив",
            onClick: () => {
              window.location.href = `/w/${wsSlug}/archive`;
            },
          },
        });
    });
  }

  function onDelete() {
    if (!window.confirm(`Удалить проект «${name}» со всеми задачами?`)) return;
    startTransition(async () => {
      const res = await deleteProjectAction(wsSlug, id);
      if (!res.ok) toast.error(res.error);
      else toast.success(`Проект «${name}» удалён`);
    });
  }

  return (
    <Card className="group hover:border-foreground/30 relative gap-2 overflow-hidden p-4 transition-colors">
      <Link
        href={`/w/${wsSlug}/p/${slug}`}
        className="absolute inset-0 z-10 rounded-xl"
        aria-label={name}
      />
      <div className="pointer-events-none relative z-20 flex items-start justify-between gap-2 pl-2">
        <h3 className="truncate text-base font-semibold">{name}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground pointer-events-auto size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              onClick={(e) => e.preventDefault()}
              aria-label="Действия"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onArchive} disabled={pending}>
              <Archive className="size-4" /> В архив
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} disabled={pending} variant="destructive">
              <Trash2 className="size-4" /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-muted-foreground pointer-events-none relative z-20 truncate pl-2 text-xs">
        /{slug}
      </p>
    </Card>
  );
}
