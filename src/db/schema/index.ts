// Aggregated schema exports. Add new aggregates as the project grows.
//   Этап 1 → ./auth (user/session/account/verification + organization/member/invitation)
//   Этап 2 → ./projects (projects/boards/columns)
//   Этап 3 → ./tasks (tasks + tasks_fts)
//   Этап 5 → ./comments / ./activity
//   Этап 6 → ./labels
//   Этап 11 → ./templates (task_templates)
//   Этап 12 → ./attachments
//   Этап 13 → ./custom-fields
export * from "./auth";
export * from "./projects";
export * from "./tasks";
export * from "./activity";
export * from "./labels";
export * from "./templates";
export * from "./attachments";
export * from "./custom-fields";
