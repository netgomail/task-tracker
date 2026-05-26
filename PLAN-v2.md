# Task Tracker — План v2 (Post-MVP, Этапы 9–15)

> Продолжение `PLAN.md`. MVP (Этапы 0–8) закрыт 2026-05-25.
> Этот документ описывает 7 фич, выбранных пользователем после MVP, в порядке возрастания сложности.
> Каждый этап завершается **рабочим, демонстрируемым** состоянием и **отдельным git-коммитом** (см. `feedback_commits.md`).

---

## 0. TL;DR — что добавляем

| #  | Этап                          | Сложн. | Зачем                                                                  |
| -- | ----------------------------- | :----: | ---------------------------------------------------------------------- |
| 9  | **Архив с восстановлением**   |   ⭐   | Сейчас архивные задачи никуда не выводятся — данные есть, UI нет.      |
| 10 | **Табличный вид задач**       |   ⭐⭐  | Альтернатива доске: плоский список с сортировкой/фильтрами.            |
| 11 | **Шаблоны задач**             |   ⭐⭐  | Снимок задачи с подзадачами и чеклистом; новая задача «из шаблона».   |
| 12 | **Вложения файлов**           |   ⭐⭐⭐ | Прикрепить файл к задаче. Локальная папка на сервере.                  |
| 13 | **Кастомные поля**            |   ⭐⭐⭐ | Произвольные поля на задаче с типами `text/number/select/date/url`.    |
| 14 | **Автоматизации**             |  ⭐⭐⭐⭐ | Правила «когда X → сделай Y». Триггеры на доменные события.            |
| 15 | **Отчёты и аналитика**        |  ⭐⭐⭐⭐ | Velocity, throughput, нагрузка по исполнителям. Графики (recharts).    |

---

## 1. Общие договорённости (касаются всех этапов)

### 1.1 Архитектура — как в PLAN.md §3.1
- UI → `actions/` → `services/` → `db/`. Без обходов.
- Каждая новая таблица несёт `workspace_id` и проверяется в `services` через `actor`.
- ID — UUIDv7, slug — первые 8 символов.
- Любая мутация пишет `activity_events` (новые типы добавляем в `services/activity:ActivityType`).
- После мутации — `revalidatePath` + `notifyBoard` (если затрагивается доска).

### 1.2 Подводные камни, унаследованные из MVP (из `next-step.md`)
- В slug'ах — только ASCII (заголовок `x-action-redirect` ломается на кириллице).
- Cookie-ставящие better-auth-вызовы — только из Server Action, не из Server Component.
- `useEffect` для fetch-on-mount с setState — добавлять `// eslint-disable-next-line react-hooks/set-state-in-effect`.
- `useOptimistic` + DnD — считать позиции от server snapshot, не от optimistic state.
- В Next.js 16 — `proxy.ts`, не `middleware.ts`.

### 1.3 Git-flow
- Один этап = один коммит.
- Сообщения коммитов — на русском, без `Co-Authored-By` (`/home/denis/.claude/CLAUDE.md`).
- После этапа: `npx tsc --noEmit && npx eslint .` → коммит → отметка в этом файле.

### 1.4 Что НЕ делаем
- Не вводим внешний storage (S3/MinIO) в Этапе 12 — только локальная папка.
- Не делаем мобильное приложение / push-уведомления.
- Не делаем CRDT / real-time editing описаний.
- Не добавляем GraphQL/tRPC — Server Actions достаточно.

---

## 2. Этап 9. Архив с восстановлением (⭐ 0.5 дня)

### 2.1 Что уже есть
- Колонка `tasks.archived_at` (см. `src/db/schema/tasks.ts:35`).
- Action `archiveTask` / `unarchiveTask` могут уже быть; если нет — добавляем.
- В выборках доски фильтр `archivedAt IS NULL` стоит.

### 2.2 Что делаем
1. **Сервис** `services/archive.ts`:
   - `listArchivedTasks(actor, { projectId?, query?, page, pageSize })` — с пагинацией (20/стр).
   - `restoreTask(actor, taskId)` — снимает `archived_at`, ставит в колонку «по умолчанию» (первая по `order_key` текущего проекта), записывает activity `task.restore`.
   - `permanentlyDelete(actor, taskId)` — hard delete, только для роли `owner`/`admin`.
2. **Action'ы** `actions/archive.ts`: обёртки + `revalidatePath`.
3. **Страница** `/w/[wsSlug]/archive` (вне конкретного проекта — workspace-wide):
   - Фильтр по проекту (select), поиск по тексту (тот же FTS5).
   - Таблица: заголовок, проект, кто архивировал, когда, кнопки **Восстановить** / **Удалить навсегда**.
   - Пустое состояние «Архив пуст».
4. **Меню «⋯» на карточке задачи** уже архивирует — после архивации показывать toast «Архивировано · Открыть архив» с ссылкой.
5. **Activity-типы**: `task.archive` (уже), `task.restore`, `task.permanently_delete`.

### 2.3 Чек-лист
- [x] Сервис `archive.ts` (list/restore/permanentlyDelete).
- [x] Action'ы + Zod-схемы.
- [x] Страница `/w/[wsSlug]/archive` + пункт в `app-sidebar.tsx`.
- [x] Toast с deep-link'ом из меню «⋯».
- [ ] Тест на permission (member не может permanentlyDelete). — отложено: тесты подключим, когда наберём базу e2e.
- [x] Коммит «этап 9: архив с восстановлением».

### 2.4 Подводные камни
- При восстановлении задачи в проект, где исходной колонки нет (вдруг колонка была удалена) — fallback на первую колонку.
- `permanentlyDelete` каскадно сносит подзадачи, комментарии, attachments — проверить `onDelete` в схемах.

---

## 3. Этап 10. Табличный вид задач (⭐⭐ 1 день)

### 3.1 Что уже есть
- `services/tasks:listForProject` уже умеет фильтры (labels, priority, assignee, query).
- В URL — `?label=&priority=&assignee=&q=` (PLAN.md §6, Этап 6).

### 3.2 Что делаем
1. **Переключатель вида** на странице доски: `Board | Table` (segmented control, shadcn `ToggleGroup`).
   - Сохраняем выбор в `localStorage` per project + поддержка `?view=table` в URL для шаринга.
2. **Компонент** `TaskTable` (`components/board/task-table.tsx`):
   - Колонки: чекбокс, ID (короткий), заголовок, статус (колонка), исполнитель (аватар), приоритет (chip), метки, дедлайн, создан, действия (⋯).
   - Сортировка по любой колонке — URL-state (`?sort=dueAt&dir=asc`).
   - Кликабельный заголовок задачи → открывает `TaskDialog` (тот же `?task=<id>`).
   - Bulk-actions: при выделенных строках появляется bar с «Архивировать / Назначить / Сменить приоритет» (Этап 10.5, если хватит времени — можно вынести).
3. **Виртуализация** — не делаем в MVP-итерации (до ~500 задач TanStack-table не нужен; пользователь явно скажет, когда упрётся).
4. **Группировка** (опц.): toggle «Группировать по колонке / по исполнителю / по метке» — приоритет ниже основной функциональности.

### 3.3 Чек-лист
- [x] `ToggleGroup` Board/Table в шапке доски (`view-toggle.tsx`).
- [x] `TaskTable` с сортировкой по столбцам (title/column/assignee/priority/due/created).
- [x] URL-state для `view`, `sort`, `dir`. localStorage persist выбора view per project.
- [x] Открытие задачи в модалке из строки таблицы (тот же `?task=<id>` + `TaskDialog`).
- [x] Адаптив: горизонтальный overflow + `min-w-[900px]` на таблице.
- [x] Коммит «этап 10: табличный вид задач».

### 3.4 Подводные камни
- Сортировка по `orderKey` лексикографическая ≠ человеческая. Для таблицы лучше сортировать по `createdAt` по умолчанию.
- Сортировка по дате — `null` (нет дедлайна) в конце, не в начале.

---

## 4. Этап 11. Шаблоны задач (⭐⭐ 1.5 дня)

### 4.1 Схема БД (миграция 0005)
```ts
task_templates (
  id          pk text,
  workspace_id fk organization.id cascade,
  name        text not null,
  description text,
  type        text default 'task',
  priority    text default 'normal',
  color       text default 'slate',
  labels      text,           -- JSON array of label ids (snapshot)
  subtasks    text,           -- JSON array of {title}
  checklist   text,           -- JSON array of {title, done:false}   (Этап 11.5 — пока нет UI чеклиста на задаче, см. ниже)
  created_by  fk user.id,
  created_at, updated_at
)
```

> **Решение**: чеклист храним в JSON-поле шаблона, но **не** добавляем поле «чеклист» к самой задаче в этом этапе. Если у задачи нет чеклиста, при инстансировании шаблона — превращаем `checklist[]` в подзадачи. Это позволяет реализовать функцию без новой таблицы и связанного UI.

### 4.2 Что делаем
1. **Сервис** `services/templates.ts`:
   - `listTemplates(actor)`, `createTemplate(actor, input)`, `updateTemplate`, `deleteTemplate`.
   - `createTaskFromTemplate(actor, { templateId, projectId, columnId })` — внутри транзакции создаёт задачу + подзадачи + цепляет метки.
2. **Action'ы** + Zod.
3. **UI: страница** `/w/[wsSlug]/settings/templates` — список шаблонов, кнопка «Новый шаблон», редактор шаблона (тот же layout, что `TaskDialog`, без статуса/исполнителя/дедлайна).
4. **UI: создание задачи** — в `NewTaskForm` (inline в колонке) и в кнопке «+» доски добавить разделитель **«Из шаблона»** с дропдауном выбора.
5. **Сохранение задачи как шаблона** — пункт в меню «⋯» карточки `Сохранить как шаблон…` → открывает диалог с именем шаблона, по подтверждению клонирует.

### 4.3 Чек-лист
- [x] Миграция 0005 (task_templates).
- [x] services/templates.ts (CRUD + createTaskFromTemplate с транзакцией + createTemplateFromTask).
- [x] actions/templates.ts.
- [x] Страница settings/templates с CRUD (dialog-форма: имя, описание, тип, приоритет, цвет, метки, подзадачи).
- [x] Селектор «Из шаблона» в NewTaskForm (Popover в свёрнутом виде, рядом с «+ Добавить задачу»).
- [x] «⋯ → Сохранить как шаблон» в task-card (с Dialog) и в task-dialog (с prompt).
- [x] Пункт «Шаблоны» в sidebar.
- [x] Коммит «этап 11: шаблоны задач».

### 4.4 Подводные камни
- Метки в шаблоне храним как **snapshot id**'ов. Если метка удалена — при инстансировании пропускаем без ошибки.
- Подзадачи в шаблоне без `orderKey` — генерим по порядку при инстансировании.

---

## 5. Этап 12. Вложения файлов (⭐⭐⭐ 1.5 дня)

### 5.1 Решение по хранилищу (выбор пользователя)
**Локальная папка на сервере**: `./data/attachments/<workspaceId>/<taskId>/<uuid>.<ext>`.
- Папка `./data/` уже игнорируется git'ом (рядом с `app.db`).
- Доступ через `/api/files/[attachmentId]` с проверкой permission.
- Делаем тонкую абстракцию `lib/storage.ts` — `LocalStorageDriver` с интерфейсом `{ put, get, delete }`. При переезде на S3 — только новая реализация драйвера, остальное не трогаем.

### 5.2 Схема БД (миграция 0006)
```ts
attachments (
  id           pk text,
  workspace_id fk organization.id cascade,
  task_id      fk tasks.id cascade,
  filename     text not null,        -- оригинальное имя
  mime_type    text not null,
  size_bytes   integer not null,
  storage_key  text not null,        -- путь внутри driver'а
  uploaded_by  fk user.id,
  created_at
)
```
Индексы: `(workspace_id, task_id)`.

### 5.3 Что делаем
1. **`lib/storage.ts`**: `LocalStorageDriver` (read/write через `node:fs/promises`).
2. **Сервис** `services/attachments.ts`: `list / upload / remove`.
   - Лимиты: ≤ 25 МБ/файл, ≤ 50 МБ суммарно на задачу. Конфиг в `lib/limits.ts`.
   - Allowlist MIME: `image/*, application/pdf, text/*, application/zip, application/json`. Остальное — 400.
   - Защита от path traversal: storage_key собирается из UUID, не из filename.
3. **API-routes** (для загрузки/скачивания — Server Action не годится для бинарных стримов):
   - `POST /api/attachments` (multipart) — авторизация через `getServerSession`, парсинг через native `formData()`, проверка лимитов.
   - `GET /api/files/[attachmentId]` — проверка членства в workspace, отдача стрима.
4. **UI**:
   - В `TaskDialog` секция «Вложения» (под комментариями): drag-zone + список файлов с превью для изображений (img-tag с теми же `/api/files/`).
   - Кнопка «Скачать» / «Удалить» (роль ≥ `member` для удаления своих, `admin` — любых).
5. **Activity-типы**: `attachment.add`, `attachment.remove`.
6. **CSP**: в `next.config.ts` — `img-src 'self'` уже должен это покрывать; проверить.

### 5.4 Чек-лист
- [x] Миграция 0006 (attachments).
- [x] `lib/storage.ts` с `LocalStorageDriver` (put/read/readAll/delete/size, path-traversal protection).
- [x] services/attachments.ts (list/upload/getMeta/remove + purgeForTask/purgeForProject для hard-delete каскада).
- [x] `POST /api/attachments` (multipart) и `GET /api/files/[id]` (inline для image/pdf/text, `?download=1` для force).
- [x] UI секции вложений в TaskDialog: drag-zone, превью для изображений, кнопки скачать/удалить.
- [x] Проверка лимитов (25 МБ/файл, 50 МБ и 30 файлов на задачу) и MIME-allowlist.
- [x] Activity attachment.add / .remove. Каскад на hard-delete задачи и проекта.
- [x] `/data/attachments/` в .gitignore.
- [x] Коммит «этап 12: вложения файлов (локальное хранилище)».

### 5.5 Подводные камни
- На удалении задачи каскадно сносим attachments — но **файлы на диске нужно удалять отдельно**: hook в service `tasks.permanentlyDelete` + service `tasks.archive` (нет, при архиве файлы оставляем). При hard-delete — service вычитывает список attachments, удаляет файлы, потом коммитит транзакцию.
- При orphan-файлах (вылет процесса между write и insert) — добавить `scripts/gc-attachments.ts` для cron-уборки. Сделать **позже** при необходимости, в чек-лист не включаем.
- В Next.js 16 streaming response: вернуть `new Response(stream)` с заголовком `Content-Disposition`.

---

## 6. Этап 13. Кастомные поля (⭐⭐⭐ 2 дня)

### 6.1 Схема БД (миграция 0007)
```ts
custom_field_defs (
  id           pk text,
  workspace_id fk organization.id cascade,
  project_id   fk projects.id cascade,   -- поле живёт в проекте
  name         text not null,
  type         text not null,            -- 'text'|'number'|'select'|'date'|'url'|'checkbox'
  options      text,                      -- JSON для 'select': [{value,label,color}]
  required     integer default 0,
  order_key    text not null,
  created_at, updated_at,
  uniq(project_id, name)
)

custom_field_values (
  task_id      fk tasks.id cascade,
  field_id     fk custom_field_defs.id cascade,
  value_text   text,            -- хранение «как есть», тип валидируется приложением
  pk(task_id, field_id)
)
```
Индексы: `(project_id)`, `(field_id, value_text)` для будущей фильтрации.

### 6.2 Что делаем
1. **Сервис** `services/custom-fields.ts`:
   - CRUD `defs` (только `admin`/`owner`).
   - `setValue(actor, taskId, fieldId, value)` — валидирует тип, апсертит.
   - `getForTask(actor, taskId)` — джойн с def'ами.
2. **UI: настройки проекта** `/w/[wsSlug]/p/[projectKey]/settings` (если страница есть; иначе создаём) → таб «Поля»:
   - Список полей с DnD-сортировкой (через `@dnd-kit` + `order_key`).
   - Кнопка «+ Поле»: тип, имя, опции (для select), обязательное.
3. **UI: TaskDialog** — секция «Дополнительно» под основными полями: рендерим поля проекта; для каждого — соответствующий input (число/дата/select).
4. **UI: фильтры доски** — расширяем панель фильтров: для `select`-полей добавляем чипы.

### 6.3 Чек-лист
- [x] Миграция 0007 (custom_field_defs + values) с CHECK на type.
- [x] services/custom-fields.ts с валидацией по типу (text/number/select/date/url/checkbox), upsert через ON CONFLICT.
- [x] actions/custom-fields.ts (RBAC ≥ admin для CRUD, любой member для setValue).
- [x] Страница `/w/[wsSlug]/p/[slug]/settings` с FieldsEditor (CRUD + reorder up/down).
- [x] Рендер полей в TaskDialog (секция «Дополнительно» в правом sidebar).
- [ ] (опц.) Фильтр доски по select-полю — отложено.
- [x] Кнопка «⚙» в шапке проекта со ссылкой на /settings.
- [x] Коммит «этап 13: кастомные поля».

### 6.4 Подводные камни
- Хранение в `value_text` (везде строка) — компромисс: меньше колонок, проще миграции, но фильтрация по `number > 5` требует `CAST`. Для MVP кастомных полей это ок; индекс по `(field_id, value_text)` всё равно даст быстрый equality-поиск.
- `select` с удалённой опцией: значения остаются, в UI рендерим серым с пометкой «(удалён)».

---

## 7. Этап 14. Автоматизации (⭐⭐⭐⭐ 2.5 дня)

### 7.1 Модель
Правило = `WHEN <trigger> [IF <conditions>] THEN <actions>`.

**Триггеры (MVP-набор)**:
- `task.created`
- `task.moved` (на любую колонку / на конкретную)
- `task.assigned` / `task.unassigned`
- `task.due_passed` (cron-проверка раз в час)
- `task.label_added` / `task.label_removed`

**Условия** (combinable AND):
- `column == X`, `assignee == Y / unassigned`, `priority in [...]`, `has_label X`.

**Действия (MVP-набор)**:
- `set_priority(level)`
- `set_color(color)`
- `add_label(id)` / `remove_label(id)`
- `assign_to(user_id)`
- `move_to_column(id)`
- `mark_complete()`
- `add_comment(text)` — текст через template `${task.title}`.

### 7.2 Схема БД (миграция 0008)
```ts
automations (
  id           pk text,
  workspace_id fk cascade,
  project_id   fk projects.id cascade,
  name         text not null,
  enabled      integer default 1,
  trigger      text not null,       -- JSON {type, params}
  conditions   text,                -- JSON [{key, op, value}]
  actions      text not null,       -- JSON [{type, params}, ...]
  created_by   fk user.id,
  created_at, updated_at
)

automation_runs (
  id           pk text,
  automation_id fk cascade,
  task_id      fk tasks.id cascade,
  status       text,                -- 'success'|'error'|'skipped'
  details      text,                -- JSON {actions_run, errors}
  created_at
)
```

### 7.3 Исполнение
- В `services/tasks` и `services/labels` после успешной мутации — вызов `runAutomations(actor, event)`.
- `services/automations:runAutomations(event)`:
  1. Достаёт все enabled-правила проекта с подходящим триггером.
  2. Проверяет условия.
  3. Запускает действия **через те же сервисы** (никаких прямых `db`-запросов).
  4. Записывает `automation_runs`.
- Anti-loop: `actor.automationDepth` (счётчик в `actor`), макс 3 уровня вложенности. Если правило ставит метку, которая триггерит другое — ок до 3 шагов.
- `due_passed`: добавляем `scripts/cron-automations.ts` + документация «запускать каждый час cron'ом» (в этом этапе — без встроенного шедулера).

### 7.4 UI
- `/w/[wsSlug]/p/[projectKey]/settings/automations`:
  - Список правил, toggle enabled/disabled.
  - Редактор правила — пошаговый: триггер → условия (AND-чипы) → действия (список с reorder).
  - История запусков на правиле (последние 50 из `automation_runs`).

### 7.5 Чек-лист
- [ ] Миграция 0008 (automations + automation_runs).
- [ ] services/automations.ts (loader + runner с anti-loop).
- [ ] Хуки в services/tasks и services/labels (после мутации → runAutomations).
- [ ] UI редактор правил.
- [ ] scripts/cron-automations.ts для due_passed.
- [ ] Тест на anti-loop (правило A триггерит B, B триггерит A → стоп после 3).
- [ ] Коммит «этап 14: автоматизации».

### 7.6 Подводные камни
- Запуск действий **через services, а не напрямую через db** — критично, чтобы automation тоже писала activity и триггерила другие automations.
- Если действие вылетает с ошибкой — записать в `automation_runs.status='error'`, **не** откатывать всё правило. Каждое действие — независимая транзакция.
- `revalidatePath` после automation-run — один раз в конце, не на каждое действие.

---

## 8. Этап 15. Отчёты и аналитика (⭐⭐⭐⭐ 2 дня)

### 8.1 Что считаем
1. **Throughput**: задач закрыто за период (день/неделя/месяц), bar-chart.
2. **Velocity**: то же, но в разрезе исполнителей.
3. **Load by assignee**: сколько активных задач у кого, stacked bar по приоритету.
4. **Cycle time**: среднее время от `created_at` до `completed_at`, line-chart по периодам.
5. **Lead time на колонку**: среднее время задачи в каждой колонке (агрегация по `activity_events` `task.move`).
6. **Burndown проекта** (опц.): если есть дедлайн проекта (поля пока нет, добавляем `projects.due_at` в миграции 0009).

### 8.2 Что добавляем в схему
- Миграция 0009: `projects.due_at` (для burndown). Опционально, можно отложить.
- **Не** делаем materialized views — пересчёт на каждый запрос, есть индексы.

### 8.3 Архитектура
- `services/reports.ts`: один файл с функциями вида `throughput(actor, { projectId?, from, to, granularity })`.
- **Все запросы через Drizzle**, без сырого SQL где можно (для cycle time — придётся подзапросом на `activity_events`).
- Кэш: `unstable_cache` Next.js с тегом `report:<project>`, ttl 60с.

### 8.4 UI
- `/w/[wsSlug]/reports` (workspace-wide) и `/w/[wsSlug]/p/[projectKey]/reports` (project-only).
- Карточки-метрики сверху: «Закрыто за неделю», «Среднее cycle time», «Самый загруженный».
- Графики: recharts (новая зависимость), bar/line.
- Date-range picker (shadcn calendar в popover'е).
- Экспорт CSV (одна кнопка → server action → blob).

### 8.5 Чек-лист
- [ ] Миграция 0009 (projects.due_at, опц.).
- [ ] services/reports.ts с throughput/velocity/load/cycleTime.
- [ ] Установить recharts.
- [ ] Страница /w/[wsSlug]/reports.
- [ ] Страница /w/[wsSlug]/p/[projectKey]/reports.
- [ ] Экспорт CSV.
- [ ] Коммит «этап 15: отчёты и аналитика».

### 8.6 Подводные камни
- Активити `task.move` — наш единственный источник для cycle/lead time. Старые задачи (до Этапа 4) могут не иметь полной истории — в отчёт включаем «есть данные с …».
- `recharts` ставит много deps — проверить bundle size перед мержем.
- На большой выборке (>10к activity_events) — добавить индекс `(workspace_id, created_at)`.

---

## 9. Risk log (общий по плану v2)

| Риск                                                         | Митигация                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| Файлы attachments переполнят диск                            | Лимит на задачу + scripts/gc-attachments.ts + мониторинг.       |
| Автоматизации зацикливаются                                  | Anti-loop по depth, тест на цикл A↔B.                           |
| Кастомные поля ломают существующие задачи                    | Все поля nullable, `getForTask` возвращает пустой массив.       |
| Шаблоны ссылаются на удалённые метки                         | При инстансировании пропускаем несуществующие label_id.         |
| Отчёты медленно строятся при росте activity_events           | Индекс `(workspace_id, created_at)`; cache 60с.                 |
| Архив скрывает важные задачи от поиска                       | На странице архива — тот же FTS5; в основном поиске — нет архива.|

---

## 10. Decision log (v2)

> Дозаписываем сюда все «развилки», где выбор не очевиден.

- **2026-05-25 — Порядок этапов 9–15**: по возрастанию сложности. Архив → Таблица → Шаблоны → Вложения → Кастомные поля → Автоматизации → Отчёты. Причина: ранние этапы дают «бытовые» удобства быстро, поздние требуют новой инфраструктуры.
- **2026-05-25 — Storage для вложений**: локальная папка `./data/attachments/`. Причина: проект single-server, нет инфраструктуры под S3. Введена абстракция `lib/storage.ts:StorageDriver`, чтобы заменить на S3 без переделки UI/services.
- **2026-05-25 — Чеклист в шаблонах**: храним в JSON-поле шаблона, при инстансировании конвертируем в подзадачи. Причина: не вводим новую сущность ради одной фичи. Отдельный «чеклист» (несвязанные пункты внутри задачи) — на будущее, если попросят.
- **2026-05-25 — Кастомные поля привязаны к проекту, не workspace**: разные проекты часто имеют разные поля (story points для разработки, deadline для маркетинга). Workspace-level — слишком грубо.
- **2026-05-25 — Автоматизации запускают actions через services**: чтобы automation сама писала activity и могла триггерить другие правила (с anti-loop по depth). Альтернатива (прямые db-вызовы) дала бы быстрее, но сломала бы аудит.
- **2026-05-25 — Cron для `due_passed`**: внешний cron (документация), без встроенного шедулера в этом этапе. Причина: не тянем `node-cron`/queue ради одной фичи. Когда понадобится больше периодических задач — отдельный этап.

---

## 11. Что НЕ делаем явно

- Не делаем горизонтально-масштабируемые автоматизации (очередь, ретраи) — пока всё inline.
- Не делаем сложный конструктор формул в кастомных полях.
- Не делаем версионирование шаблонов.
- Не делаем разрешения на уровне поля кастомного-поля.
- Не делаем превью PDF/Office — только download.

---

## 12. Следующий шаг

После согласования плана:
1. Этап 9 (архив) — самое быстрое, дать пользователю «win» сразу.
2. Демо/скрин, фиксируем отклонения в Decision log.
3. Этап 10 (таблица), и так далее.

Прогресс отмечаем в чек-листах §§ 2.3 / 3.3 / 4.3 / 5.4 / 6.3 / 7.5 / 8.5 — единый источник правды.
