"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";

export function ArchiveFilters({
  wsSlug,
  projects,
  currentProject,
  currentQuery,
}: {
  wsSlug: string;
  projects: { slug: string; name: string }[];
  currentProject: string | null;
  currentQuery: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(currentQuery);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushQuery(nextQ: string, nextProject: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextQ.trim()) params.set("q", nextQ.trim());
    else params.delete("q");
    if (nextProject) params.set("project", nextProject);
    else params.delete("project");
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.push(`/w/${wsSlug}/archive${qs ? `?${qs}` : ""}`);
    });
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q === currentQuery) return;
    debounceRef.current = setTimeout(() => {
      pushQuery(q, currentProject);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Поиск по заголовку и описанию…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-9 max-w-sm"
      />
      <div className="flex flex-wrap items-center gap-1">
        <FilterChip
          active={!currentProject}
          onClick={() => pushQuery(q, null)}
          label="Все проекты"
        />
        {projects.map((p) => (
          <FilterChip
            key={p.slug}
            active={currentProject === p.slug}
            onClick={() => pushQuery(q, p.slug)}
            label={p.name}
          />
        ))}
      </div>
    </div>
  );
}

function FilterChip({
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
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
