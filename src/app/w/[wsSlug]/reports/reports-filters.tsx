"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ReportsFilters({
  wsSlug,
  projects,
  currentProject,
  from,
  to,
}: {
  wsSlug: string;
  projects: { slug: string; name: string }[];
  currentProject: string | null;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  function push(next: URLSearchParams) {
    const qs = next.toString();
    startTransition(() => {
      router.push(`/w/${wsSlug}/reports${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  }

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    push(next);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <Field label="С">
        <Input
          type="date"
          value={draftFrom}
          onChange={(e) => setDraftFrom(e.target.value)}
          onBlur={() => setParam("from", draftFrom)}
          className="h-8 w-40 text-sm"
        />
      </Field>
      <Field label="По">
        <Input
          type="date"
          value={draftTo}
          onChange={(e) => setDraftTo(e.target.value)}
          onBlur={() => setParam("to", draftTo)}
          className="h-8 w-40 text-sm"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-1">
        <Chip
          active={!currentProject}
          onClick={() => setParam("project", null)}
          label="Все проекты"
        />
        {projects.map((p) => (
          <Chip
            key={p.slug}
            active={currentProject === p.slug}
            onClick={() => setParam("project", p.slug)}
            label={p.name}
          />
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
