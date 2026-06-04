import { Skeleton } from "@/components/ui/skeleton";

export default function BoardLoading() {
  return (
    <div className="flex h-[calc(100dvh-49px)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-16" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
        </div>
      </header>
      <div className="flex flex-1 gap-3 overflow-x-auto overflow-y-hidden px-6 py-4">
        {Array.from({ length: 3 }).map((_, c) => (
          <div
            key={c}
            className="flex w-80 shrink-0 flex-col gap-2 rounded-lg border border-border bg-card p-2"
          >
            <div className="flex items-center justify-between p-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-6" />
            </div>
            {Array.from({ length: 3 + c }).map((__, t) => (
              <Skeleton key={t} className="h-16 rounded-md" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
