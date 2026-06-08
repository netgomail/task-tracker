"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LabelBadge } from "@/components/label-badge";
import type { LabelRow } from "@/services/labels";
import type { RegistryRow } from "@/services/registry";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function statusLabel(r: RegistryRow): string {
  return r.completedAt ? "Готово" : r.stage;
}

function isOverdue(iso: string | null): boolean {
  return iso != null && new Date(iso).getTime() < Date.now();
}

function buildCsv(rows: RegistryRow[]): string {
  const header = [
    "Тема",
    "Документ",
    "Метки",
    "Стадия",
    "Приоритет",
    "Исполнитель",
    "Срок",
    "Пересмотр",
    "Статус",
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.theme,
      r.title,
      r.labels.map((l) => l.name).join(", "),
      r.stage,
      r.priority,
      r.assignee ?? "",
      fmtDate(r.dueAt),
      fmtDate(r.reviewAt),
      r.completedAt ? "Готово" : "В работе",
    ]
      .map((c) => esc(String(c)))
      .join(";"),
  );
  return [header.map(esc).join(";"), ...lines].join("\r\n");
}

export function RegistryView({
  wsSlug,
  rows,
  labels,
}: {
  wsSlug: string;
  rows: RegistryRow[];
  labels: LabelRow[];
}) {
  const [q, setQ] = useState("");
  const [labelFilter, setLabelFilter] = useState<string>("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (labelFilter && !r.labels.some((l) => l.id === labelFilter)) return false;
      if (needle && !`${r.title} ${r.theme}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, labelFilter]);

  function exportCsv() {
    const csv = "﻿" + buildCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `реестр-орд-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по документу или теме…"
            className="h-8 w-64 pl-7 text-sm"
          />
        </div>
        <select
          value={labelFilter}
          onChange={(e) => setLabelFilter(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Все метки</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">
          {filtered.length} из {rows.length}
        </span>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={exportCsv}>
          <Download className="size-3.5" />
          Экспорт CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Тема</th>
              <th className="px-3 py-2 font-medium">Документ</th>
              <th className="px-3 py-2 font-medium">Метки</th>
              <th className="px-3 py-2 font-medium">Стадия</th>
              <th className="px-3 py-2 font-medium">Исполнитель</th>
              <th className="px-3 py-2 font-medium">Срок</th>
              <th className="px-3 py-2 font-medium">Пересмотр</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              return (
                <tr key={r.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-3 py-2 text-muted-foreground">{r.theme}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/w/${wsSlug}/p/${r.projectSlug}?task=${r.id}`}
                      className="hover:underline"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.labels.map((l) => (
                        <LabelBadge key={l.id} label={l} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        r.completedAt && "text-green-600 dark:text-green-400",
                      )}
                    >
                      {statusLabel(r)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.assignee ?? "—"}</td>
                  <td className={cn("px-3 py-2", isOverdue(r.dueAt) && !r.completedAt && "text-red-600 dark:text-red-400")}>
                    {fmtDate(r.dueAt) || "—"}
                  </td>
                  <td className={cn("px-3 py-2", isOverdue(r.reviewAt) && "text-rose-600 dark:text-rose-400")}>
                    {fmtDate(r.reviewAt) || "—"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Ничего не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
