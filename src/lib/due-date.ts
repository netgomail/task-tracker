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

// Единая локаль всех дат приложения (была россыпь "ru"/"ru-RU" по компонентам).
const LOCALE = "ru-RU";

/**
 * Человеческий дедлайн для карточки/таблицы: «Сегодня»/«Завтра»/«Вчера»,
 * дальше — «2 фев». overdue/dueSoon — те же day-based правила, что isDueOverdue.
 */
export function formatDue(iso: string): { label: string; overdue: boolean; dueSoon: boolean } {
  const diffDays = dueDiffDays(iso);
  let label: string;
  if (diffDays === 0) label = "Сегодня";
  else if (diffDays === 1) label = "Завтра";
  else if (diffDays === -1) label = "Вчера";
  else
    label = new Date(iso).toLocaleDateString(LOCALE, {
      day: "numeric",
      month: "short",
    });
  return { label, overdue: diffDays < 0, dueSoon: diffDays === 0 || diffDays === 1 };
}

/** Числовая дата dd.mm.yyyy — реестр и CSV-экспорт. Пустая строка для null. */
export function formatNumericDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Компактная метка времени события (архив, списки): сегодня — время,
 * на этой неделе — день недели и время, дальше — полная дата.
 */
export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  if (diffMs < DAY_MS) {
    return d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
  }
  if (diffMs < 7 * DAY_MS) {
    return d.toLocaleDateString(LOCALE, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric" });
}
