"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, FileText } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import type { ThemeReadiness } from "@/services/readiness";

export function ProgressView({
  wsSlug,
  themes,
}: {
  wsSlug: string;
  themes: ThemeReadiness[];
}) {
  const withDocs = themes.filter((t) => t.total > 0);

  if (withDocs.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Пока нет проектов с задачами. Создайте проект на главной странице.
      </p>
    );
  }

  const totals = withDocs.reduce(
    (acc, t) => {
      acc.total += t.total;
      acc.done += t.done;
      acc.notStarted += t.notStarted;
      acc.overdue += t.overdueReview;
      return acc;
    },
    { total: 0, done: 0, notStarted: 0, overdue: 0 },
  );
  const overallPct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

  const chartData = withDocs.map((t) => ({ name: t.name, pct: t.progressPct }));
  const chartHeight = Math.max(160, chartData.length * 34);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Готовность" value={`${overallPct}%`} tone="blue" />
        <Stat label="Задач" value={String(totals.total)} tone="slate" />
        <Stat label="Не начато" value={String(totals.notStarted)} tone="amber" />
        <Stat label="Просрочен пересмотр" value={String(totals.overdue)} tone="rose" />
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-3 text-sm font-medium">Готовность по проектам</h2>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
            <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={200}
              tick={{ fontSize: 11 }}
              interval={0}
            />
            <Tooltip
              formatter={((v: number) => [`${v}%`, "Готовность"]) as never}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.pct === 100 ? "#10b981" : "#3b82f6"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {withDocs.map((t) => (
          <ThemeCard key={t.projectId} wsSlug={wsSlug} theme={t} />
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "slate" | "amber" | "rose";
}) {
  const toneClass = {
    blue: "text-blue-600 dark:text-blue-400",
    slate: "text-foreground",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
  }[tone];
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-semibold tabular-nums", toneClass)}>{value}</div>
    </div>
  );
}

function ThemeCard({ wsSlug, theme }: { wsSlug: string; theme: ThemeReadiness }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/w/${wsSlug}/p/${theme.slug}`}
          className="truncate font-medium hover:underline"
        >
          {theme.name}
        </Link>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {theme.done}/{theme.total} · {theme.progressPct}%
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={theme.progressPct === 100 ? "h-full bg-green-500" : "h-full bg-blue-500"}
          style={{ width: `${theme.progressPct}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
          <CheckCircle2 className="size-3.5" /> Готово: {theme.done}
        </span>
        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
          <Clock className="size-3.5" /> В работе: {theme.inProgress}
        </span>
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5" /> Не начато: {theme.notStarted}
        </span>
        {theme.overdueReview > 0 && (
          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
            <Clock className="size-3.5" /> Просрочен пересмотр: {theme.overdueReview}
          </span>
        )}
      </div>

      {theme.gaps.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <div className="text-xs font-medium text-muted-foreground">Что делать дальше:</div>
          <ul className="flex flex-col gap-1">
            {theme.gaps.slice(0, 6).map((g) => (
              <li key={g.id}>
                <Link
                  href={`/w/${wsSlug}/p/${theme.slug}?task=${g.id}`}
                  className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent"
                >
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{g.title}</span>
                </Link>
              </li>
            ))}
            {theme.gaps.length > 6 && (
              <li className="px-1 text-xs text-muted-foreground">
                …и ещё {theme.gaps.length - 6}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
