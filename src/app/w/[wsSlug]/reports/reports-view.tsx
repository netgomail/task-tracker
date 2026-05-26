"use client";

import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Summary = {
  totalDone: number;
  totalActive: number;
  cycleTime: { avgHours: number; medianHours: number; sampleSize: number };
};

type ThroughputBucket = { bucket: string; done: number };
type AssigneeStats = { userId: string | null; name: string; count: number };

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#a855f7"];

export function ReportsView({
  summary,
  throughput,
  velocity,
  load,
  rangeLabel,
}: {
  summary: Summary;
  throughput: ThroughputBucket[];
  velocity: AssigneeStats[];
  load: AssigneeStats[];
  rangeLabel: string;
}) {
  function downloadCsv() {
    const lines = [
      `# Throughput по неделям (${rangeLabel})`,
      "Дата начала недели,Закрыто задач",
      ...throughput.map((t) => `${t.bucket},${t.done}`),
      "",
      "# Velocity по исполнителям",
      "Исполнитель,Закрыто",
      ...velocity.map((v) => `"${v.name}",${v.count}`),
      "",
      "# Текущая загрузка",
      "Исполнитель,Активных задач",
      ...load.map((l) => `"${l.name}",${l.count}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Период: {rangeLabel}</p>
        <Button size="sm" variant="outline" onClick={downloadCsv}>
          <Download className="size-3.5" /> Экспорт CSV
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          title="Закрыто за период"
          value={summary.totalDone}
          hint={throughput.length > 0 ? `${throughput.length} нед` : undefined}
        />
        <Metric title="Активных задач" value={summary.totalActive} />
        <Metric
          title="Cycle time (среднее)"
          value={formatHours(summary.cycleTime.avgHours)}
          hint={`по ${summary.cycleTime.sampleSize} задачам`}
        />
        <Metric
          title="Cycle time (медиана)"
          value={formatHours(summary.cycleTime.medianHours)}
          hint="50-й перцентиль"
        />
      </div>

      <ChartCard title="Закрыто задач по неделям">
        {throughput.length === 0 ? (
          <Empty>За период не закрыли ни одной задачи.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={throughput}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip wrapperClassName="!text-xs" />
              <Bar dataKey="done" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Velocity по исполнителям">
          {velocity.length === 0 ? (
            <Empty>Нет закрытых задач за период.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={velocity} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip wrapperClassName="!text-xs" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]}>
                  {velocity.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Текущая загрузка по исполнителям">
          {load.length === 0 ? (
            <Empty>Активных задач нет.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={load} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                <Tooltip wrapperClassName="!text-xs" />
                <Bar dataKey="count" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]}>
                  {load.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[(i + 3) % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Metric({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-background p-4">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <span className="text-2xl font-semibold">{value}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn("flex h-40 items-center justify-center text-sm text-muted-foreground")}>
      {children}
    </div>
  );
}

function formatHours(h: number): string {
  if (h === 0) return "—";
  if (h < 1) return `${Math.round(h * 60)} мин`;
  if (h < 24) return `${h.toFixed(1)} ч`;
  return `${(h / 24).toFixed(1)} дн`;
}
