import { isDueOverdue } from "@/lib/due-date";

export function toLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

export function fromLocalDatetime(value: string): string {
  return value ? new Date(value).toISOString() : "";
}

export function isPast(iso: string | null): boolean {
  // Day-based, как на карточке и в списке задач: «просрочено» = календарный день прошёл.
  return iso != null && isDueOverdue(iso);
}
