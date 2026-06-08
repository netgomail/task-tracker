import {
  TASK_LINK_TYPES,
  TASK_PRIORITIES,
  TASK_TYPES,
  type TaskLinkType,
  type TaskPriority,
  type TaskType,
} from "./types";

export function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}
export function asTaskType(value: string, fallback: TaskType = "task"): TaskType {
  return isTaskType(value) ? value : fallback;
}

export function isPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}
export function asPriority(value: string | undefined, fallback: TaskPriority = "normal"): TaskPriority {
  return value && isPriority(value) ? value : fallback;
}

export function isLinkType(value: string): value is TaskLinkType {
  return (TASK_LINK_TYPES as readonly string[]).includes(value);
}
export function asLinkType(value: string, fallback: TaskLinkType = "relates"): TaskLinkType {
  return isLinkType(value) ? value : fallback;
}
