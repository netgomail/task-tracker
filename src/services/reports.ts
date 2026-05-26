import "server-only";

import { and, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { tasks } from "@/db/schema/tasks";

export type ReportRange = {
  /** Включительно. */
  from: Date;
  /** Не включается (полуоткрытый интервал [from, to)). */
  to: Date;
};

export type ThroughputBucket = {
  /** ISO-дата начала бакета (например, "2026-05-19" — понедельник). */
  bucket: string;
  done: number;
};

/**
 * Закрытые задачи в неделю. Бакеты — недели по понедельникам.
 * Запрос на стороне SQLite через strftime + day-of-week math.
 */
export async function throughput(
  workspaceId: string,
  range: ReportRange,
  opts: { projectId?: string } = {},
): Promise<ThroughputBucket[]> {
  const conditions = [
    eq(tasks.workspaceId, workspaceId),
    isNotNull(tasks.completedAt),
    gte(tasks.completedAt, range.from),
    lt(tasks.completedAt, range.to),
    isNull(tasks.archivedAt),
  ];
  if (opts.projectId) conditions.push(eq(tasks.projectId, opts.projectId));

  // SQLite не имеет date_trunc; считаем «начало недели» через арифметику с
  // unixepoch: понедельник 00:00 UTC = floor((ts - 345600)/604800)*604800+345600
  // (4 дня смещение от четверга 1970-01-01).
  const bucketExpr = sql<number>`(((unixepoch(${tasks.completedAt}/1000.0, 'unixepoch') - 345600) / 604800) * 604800 + 345600) * 1000`;

  const rows = await db
    .select({
      bucket: bucketExpr,
      done: sql<number>`count(*)`,
    })
    .from(tasks)
    .where(and(...conditions))
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);

  return rows.map((r) => ({
    bucket: new Date(Number(r.bucket)).toISOString().slice(0, 10),
    done: Number(r.done),
  }));
}

export type AssigneeStats = {
  userId: string | null;
  name: string;
  count: number;
};

/**
 * Velocity: сколько каждый исполнитель закрыл задач за период.
 */
export async function velocityByAssignee(
  workspaceId: string,
  range: ReportRange,
  opts: { projectId?: string } = {},
): Promise<AssigneeStats[]> {
  const conditions = [
    eq(tasks.workspaceId, workspaceId),
    isNotNull(tasks.completedAt),
    gte(tasks.completedAt, range.from),
    lt(tasks.completedAt, range.to),
    isNull(tasks.archivedAt),
  ];
  if (opts.projectId) conditions.push(eq(tasks.projectId, opts.projectId));

  const rows = await db
    .select({
      assigneeId: tasks.assigneeId,
      name: user.name,
      count: sql<number>`count(*)`,
    })
    .from(tasks)
    .leftJoin(user, eq(user.id, tasks.assigneeId))
    .where(and(...conditions))
    .groupBy(tasks.assigneeId, user.name)
    .orderBy(sql`count(*) desc`);

  return rows.map((r) => ({
    userId: r.assigneeId,
    name: r.name ?? "Без исполнителя",
    count: Number(r.count),
  }));
}

/**
 * Текущая загрузка: активные (не завершённые, не архивные) задачи по исполнителям.
 */
export async function loadByAssignee(
  workspaceId: string,
  opts: { projectId?: string } = {},
): Promise<AssigneeStats[]> {
  const conditions = [
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.archivedAt),
    isNull(tasks.completedAt),
    isNull(tasks.parentId),
  ];
  if (opts.projectId) conditions.push(eq(tasks.projectId, opts.projectId));

  const rows = await db
    .select({
      assigneeId: tasks.assigneeId,
      name: user.name,
      count: sql<number>`count(*)`,
    })
    .from(tasks)
    .leftJoin(user, eq(user.id, tasks.assigneeId))
    .where(and(...conditions))
    .groupBy(tasks.assigneeId, user.name)
    .orderBy(sql`count(*) desc`);

  return rows.map((r) => ({
    userId: r.assigneeId,
    name: r.name ?? "Без исполнителя",
    count: Number(r.count),
  }));
}

export type CycleTimeStats = {
  /** Среднее время от created_at до completed_at в часах. */
  avgHours: number;
  /** Медиана в часах. */
  medianHours: number;
  /** Сколько задач учтено. */
  sampleSize: number;
};

/**
 * Cycle time: среднее/медиана от created_at до completed_at для задач,
 * закрытых в указанном интервале.
 */
export async function cycleTime(
  workspaceId: string,
  range: ReportRange,
  opts: { projectId?: string } = {},
): Promise<CycleTimeStats> {
  const conditions = [
    eq(tasks.workspaceId, workspaceId),
    isNotNull(tasks.completedAt),
    gte(tasks.completedAt, range.from),
    lt(tasks.completedAt, range.to),
    isNull(tasks.archivedAt),
  ];
  if (opts.projectId) conditions.push(eq(tasks.projectId, opts.projectId));

  const rows = await db
    .select({
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .where(and(...conditions));

  if (rows.length === 0) {
    return { avgHours: 0, medianHours: 0, sampleSize: 0 };
  }

  const deltas = rows
    .map((r) =>
      r.completedAt && r.createdAt ? (r.completedAt.getTime() - r.createdAt.getTime()) / 3600_000 : null,
    )
    .filter((x): x is number => x !== null && x >= 0)
    .sort((a, b) => a - b);

  const sum = deltas.reduce((acc, x) => acc + x, 0);
  const avg = sum / deltas.length;
  const mid = Math.floor(deltas.length / 2);
  const median = deltas.length % 2 === 0 ? (deltas[mid - 1] + deltas[mid]) / 2 : deltas[mid];

  return {
    avgHours: Math.round(avg * 10) / 10,
    medianHours: Math.round(median * 10) / 10,
    sampleSize: deltas.length,
  };
}

export type ReportSummary = {
  totalDone: number;
  totalActive: number;
  cycleTime: CycleTimeStats;
};

export async function summary(
  workspaceId: string,
  range: ReportRange,
  opts: { projectId?: string } = {},
): Promise<ReportSummary> {
  const doneConds = [
    eq(tasks.workspaceId, workspaceId),
    isNotNull(tasks.completedAt),
    gte(tasks.completedAt, range.from),
    lt(tasks.completedAt, range.to),
    isNull(tasks.archivedAt),
  ];
  if (opts.projectId) doneConds.push(eq(tasks.projectId, opts.projectId));

  const activeConds = [
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.completedAt),
    isNull(tasks.archivedAt),
    isNull(tasks.parentId),
  ];
  if (opts.projectId) activeConds.push(eq(tasks.projectId, opts.projectId));

  const [doneRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(tasks)
    .where(and(...doneConds));
  const [activeRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(tasks)
    .where(and(...activeConds));

  const ct = await cycleTime(workspaceId, range, opts);

  return {
    totalDone: Number(doneRow?.value ?? 0),
    totalActive: Number(activeRow?.value ?? 0),
    cycleTime: ct,
  };
}
