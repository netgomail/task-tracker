const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Разница в календарных днях между началом сегодняшнего локального дня и
 * датой дедлайна. Math.floor, не round: дедлайн сегодня в 20:00 — это
 * +0.8 суток от полуночи, round дал бы 1 («Завтра»/просрочено на день
 * раньше времени). Единый источник правды для card/table/registry —
 * иначе они расходятся в том, что считать "просроченным".
 */
export function dueDiffDays(iso: string): number {
  const d = new Date(iso);
  const todayStart = new Date(new Date().toDateString()).getTime();
  return Math.floor((d.getTime() - todayStart) / DAY_MS);
}

/** Просрочено только если календарный день дедлайна уже прошёл — не по точному времени. */
export function isDueOverdue(iso: string): boolean {
  return dueDiffDays(iso) < 0;
}
