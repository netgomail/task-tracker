// Aggregated schema exports. Add new aggregates as the project grows.
//   Этап 1 → ./auth (user/session/account/verification + organization/member/invitation)
//   Этап 2 → ./projects (projects/boards/columns)
//   Этап 3 → ./tasks (tasks + tasks_fts)
//   Этап 5 → ./comments / ./activity
//   Этап 6 → ./labels
export * from "./auth";
export * from "./projects";
export * from "./tasks";
export * from "./activity";
