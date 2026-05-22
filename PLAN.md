# Task Tracker — план разработки

> Документ задаёт продуктовое видение, архитектуру и поэтапный план реализации.
> Обновляется по ходу проекта: меняются галочки в чек-листах, фиксируются принятые решения в разделе «Decision log».

---

## 0. TL;DR

Веб-приложение для управления задачами в стиле Linear / Trello / Jira, написанное на современном стеке (Next.js 16 App Router + React 19 + Tailwind 4), с локальной БД SQLite и архитектурой, готовой к мульти-пользовательскому режиму и подключению внешних сервисов.

Ключевые ценности:
- **Скорость взаимодействия** (optimistic UI, drag-n-drop, клавиатурные шорткаты).
- **Чистый flat-дизайн** в духе Linear: нейтральная палитра, цветные акценты только на статусах/метках, плотная сетка, минимум теней.
- **Готовность к росту**: multi-tenant с первого дня, миграции БД, прозрачные слои домен/инфраструктура/UI, версионированный API.

---

## 1. Скоуп MVP и за его пределами

### 1.1 Обязательная функциональность (MVP, всё описано пользователем)
- Создание/редактирование **проектов**.
- Доска проекта с **колонками**: имя + цвет + порядок.
- **Задачи** в колонках: заголовок, описание, цветовая метка, тип, приоритет, дедлайн.
- Drag-n-drop задач **между колонками** и **внутри колонки** (изменение порядка).
- **Подзадачи** (вложенность 1 уровень, чекбоксы).
- **Комментарии** к задаче.
- В карточке задачи — иконка ⋯ с выпадающим меню: смена цвета, создать подзадачу, удалить, дублировать.
- Палитра предустановленных цветов для колонок и меток.

### 1.2 Добавляется как «правильные практики» (best practices, важно сразу)
- **Multi-tenant** скелет: пользователи → workspaces → проекты. Даже если сейчас один пользователь, БД и API уже несут `workspace_id`.
- **Аутентификация** с e-mail/паролем и заделом на OAuth/passkeys.
- **RBAC**: роли `owner / admin / member / viewer` внутри workspace.
- **Activity log** на уровне задачи (кто что когда поменял) — фундамент для уведомлений и аудита.
- **Fractional indexing** для сортировки колонок и задач (LexoRank-style) — без массовых UPDATE при переносе.
- **Optimistic UI** для всего, что двигается мышкой.
- **Soft delete** для проектов/задач (поле `archived_at`).
- **Search**: full-text по заголовку/описанию/комментариям (SQLite FTS5).

### 1.3 Заложено в дизайн, но **за рамками MVP** (roadmap)
- Real-time синхронизация (WebSocket / SSE) и presence-аватарки.
- Уведомления (in-app, e-mail, push).
- Спринты, бэклог, story points, burn-down (Scrum-pack).
- Swimlanes, WIP-limits на колонке (Kanban-pack).
- Зависимости задач (blocks / blocked-by), Gantt.
- Кастомные поля (custom fields engine).
- Импорт/экспорт CSV/JSON, интеграции (Slack, GitHub, Linear MCP-server).
- Темная/светлая тема (в MVP — system, без переключателя в UI).
- Mobile-первый layout (в MVP — desktop-first, адаптивно ужимается).

---

## 2. Технологический стек

| Слой               | Выбор                                          | Почему                                                                                          |
| ------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Framework          | **Next.js 16 (App Router) + React 19**         | Уже стоит. Server Components + Server Actions = меньше клиентского JS и без отдельного API-слоя.|
| Стили              | **Tailwind CSS 4** + CSS-переменные            | Уже стоит. Tailwind 4 даёт OKLCh-токены, идеальные для палитр меток/колонок.                    |
| UI-компоненты      | **shadcn/ui** (Radix-primitives + Tailwind)    | Owned-code подход, доступность, отличная стыковка с Tailwind 4. Стандарт 2026.                  |
| Иконки             | **lucide-react**                               | Дефолт shadcn, легковесные SVG.                                                                 |
| Drag-and-drop      | **@dnd-kit/core + @dnd-kit/sortable**          | Совместим с React 19, оптимизирован, поддержка клавиатуры и accessibility. Используется Linear. |
| База данных        | **SQLite** через `better-sqlite3`              | Требование пользователя. Синхронные вызовы → отлично с Server Actions.                          |
| ORM                | **Drizzle ORM**                                | TypeScript-first, тонкая прослойка над SQL, нативные миграции, лёгкий bundle для serverless.    |
| Миграции           | `drizzle-kit`                                  | Из коробки.                                                                                     |
| Аутентификация     | **Better Auth**                                | Плагин organizations / RBAC «из коробки», TS-first, активно растёт, хорошо ложится на Next.js.  |
| Валидация          | **Zod**                                        | Стандарт для Server Actions и форм.                                                             |
| Формы              | `react-hook-form` + Zod resolver               | Лучший UX-контроль для модалок задачи.                                                          |
| Дата/время         | `date-fns` + `@internationalized/date`         | Лёгкая локализация дедлайнов.                                                                   |
| Тесты              | `vitest` (unit) + `playwright` (e2e, опц.)     | Быстрый dev-loop.                                                                               |
| Линт/формат        | ESLint (есть) + Prettier + `eslint-plugin-drizzle` | Гладкая команда.                                                                            |
| Логи               | `pino` (server)                                | Скорее всего понадобится позже.                                                                 |

> **Принцип принятия решений:** не тянем зависимость, пока без неё реально неудобно. Каждый пункт ниже снабжён аргументом «зачем».

---

## 3. Архитектура

### 3.1 Слои

```
app/                       — Next.js App Router (UI + Server Actions)
  (auth)/                  — login / register / forgot-password
  (app)/                   — защищённая часть (требует сессии)
    workspaces/[wsId]/
      projects/[projectId]/
        board/             — основная доска
        settings/
src/
  db/                      — drizzle: schema, client, migrations
    schema/                — один файл на агрегат
    index.ts               — экспорт `db`, `sql`
    migrate.ts
  domain/                  — чистые типы и бизнес-правила, не знают про БД
    permissions.ts
    ordering.ts            — fractional indexing
  services/                — use-case'ы: createTask, moveTask, ...
                             принимают actor + ctx, валидируют, дергают db
  actions/                 — 'use server' обёртки над services + revalidate*
  lib/
    auth.ts                — better-auth instance
    rbac.ts
    ids.ts                 — nanoid / uuidv7
    fts.ts                 — обертки над SQLite FTS5
  ui/
    components/            — shadcn + наши примитивы
    board/                 — Board, Column, Card, DnD-обвязка
    task/                  — TaskDialog, comments, subtasks, ...
    forms/
tests/
```

**Правила границ:**
- UI знает про `actions/*`, никогда не дергает `db` напрямую.
- `actions/*` валидируют вход (Zod) и вызывают `services/*`.
- `services/*` не знают про Next.js (никаких `revalidatePath`).
- `db/*` — только запросы, без бизнес-логики.
- Любая мутация проходит через `services` → значит мы можем переиспользовать их позже из REST/WebSocket/CLI.

### 3.2 Multi-tenancy

- На каждую таблицу с пользовательскими данными — колонка `workspace_id`.
- В `services/*` обязательный параметр `actor: { userId, workspaceId, role }`.
- Хелпер `requirePermission(actor, 'task:update', resource)` → бросает `ForbiddenError`.
- Никаких прямых `where (id = ?)` без `and (workspace_id = ?)`.

### 3.3 Идентификаторы

- Внешние ID — **UUIDv7** (sortable by time, дружественно к индексам). Хранятся как `TEXT`.
- В URL короткие slug'и (`wsId`, `projectId` = первые 8 символов uuid). Это удобно для шаринга и не ломает приватность.

### 3.4 Сортировка (fractional indexing)

- Поле `order_key TEXT NOT NULL` на `columns` и `tasks`.
- Используем алгоритм LexoRank-подобный: между «a» и «b» вставляем «am», между «am» и «b» — «as» и т.д.
- Преимущество: перемещение одной задачи = **один UPDATE** одной строки, никаких каскадов.
- Источники: dnd-kit + хелпер `generateKeyBetween` (`fractional-indexing` npm).

### 3.5 Кеш и инвалидация (Next.js 16)

- Списки досок/задач читаем в Server Components → `cache: 'force-cache'` + `revalidateTag('project:'+id)`.
- Каждый Server Action после мутации вызывает `revalidateTag` нужной сущности.
- Для drag-n-drop UI работает оптимистично через `useOptimistic`, серверу отправляем `moveTask`-action.

### 3.6 Аутентификация и сессии

- Better Auth с e-mail/паролем + magic-link на будущее.
- Сессии — httpOnly-cookie, sliding 30 дней.
- Плагин `organization` от Better Auth = готовый workspace + invites + роли.

### 3.7 Доменная модель (ER в прозе)

```
User ── M:N ──> Workspace        (через Membership: role)
Workspace 1:N Project
Project 1:N Board                 (на MVP — ровно одна Board на Project, но связь именно так)
Board 1:N Column                  (имя, цвет, order_key)
Column 1:N Task
Task 1:N Subtask                  (можно отдельной таблицей или recursive task.parent_id;
                                   выбираем parent_id — гибче для будущих вложений)
Task 1:N Comment
Task M:N Label                    (через TaskLabel)
Label N:1 Workspace               (палитра меток на workspace)
Task 1:N Attachment               (заглушка под файлы; не в MVP)
Task 1:N ActivityEvent            (insert-only лог изменений)
TaskType, TaskPriority            — enum-словари; либо TEXT в коде, либо отдельные таблицы (см. §4.2)
```

### 3.8 Поток данных при перемещении задачи

```
1. Пользователь тянет карточку.
2. dnd-kit определяет over-зону → клиент локально пересчитывает order_key через generateKeyBetween.
3. useOptimistic переносит карточку в UI мгновенно.
4. Server Action moveTask({taskId, toColumnId, orderKey}) валидирует:
   • actor может изменять задачу;
   • колонка из того же workspace;
   • orderKey валиден.
5. UPDATE tasks SET column_id=?, order_key=?, updated_at=? WHERE id=? AND workspace_id=?
6. INSERT ActivityEvent('task.move', from, to).
7. revalidateTag('board:'+boardId).
8. На клиенте RSC payload обновляется, useOptimistic сворачивается.
```

---

## 4. Схема БД (Drizzle / SQLite)

> Только сигнатуры, чтобы понимать модель. Точные `references()` / `onDelete` напишем в `src/db/schema/*`.

### 4.1 Таблицы

```ts
users              (id pk, email uniq, name, image, created_at)
sessions           (id pk, user_id fk, expires_at, ip, user_agent)            // Better Auth
accounts           (id pk, user_id fk, provider, provider_account_id, ...)    // Better Auth
verification_tokens(...)                                                       // Better Auth

workspaces         (id pk, name, slug uniq, created_by fk users.id, created_at)
memberships        (id pk, workspace_id fk, user_id fk, role text, created_at,
                    uniq(workspace_id, user_id))

projects           (id pk, workspace_id fk, name, key text, description,
                    color text, archived_at, created_by fk, created_at, updated_at)

boards             (id pk, project_id fk, name, created_at)

columns            (id pk, board_id fk, name, color text, order_key text,
                    wip_limit int null, created_at)

labels             (id pk, workspace_id fk, name, color text, created_at)

tasks              (id pk, workspace_id fk, project_id fk, column_id fk,
                    parent_id fk tasks.id null,    -- подзадачи
                    title, description text,
                    type text,                     -- 'task'|'bug'|'feature'|'chore' (enum через CHECK)
                    priority text,                 -- 'low'|'normal'|'high'|'urgent'
                    color text,                    -- цветовая метка карточки (из палитры)
                    due_at datetime null,
                    completed_at datetime null,
                    order_key text,
                    created_by fk users.id,
                    assignee_id fk users.id null,
                    archived_at datetime null,
                    created_at, updated_at)

task_labels        (task_id fk, label_id fk, pk(task_id, label_id))

comments           (id pk, task_id fk, author_id fk users.id, body text,
                    created_at, updated_at, deleted_at null)

activity_events    (id pk, workspace_id fk, task_id fk null, project_id fk null,
                    actor_id fk users.id, type text, payload json text, created_at)

tasks_fts          -- виртуальная FTS5 таблица (title, description, content=tasks)
```

### 4.2 Решение по enum'ам

В SQLite enum'ов нет. Варианты:
1. `text` + `CHECK (priority IN ('low','normal','high','urgent'))` — выбираем **по умолчанию**.
2. Отдельная таблица `task_types(workspace_id, name, icon, color)` — переключимся, как только захотим кастомные типы у пользователя.

В MVP реализуем (1), а слой `services/` уже принимает строку → миграция в (2) пройдёт без правок UI.

### 4.3 Индексы

- `tasks (workspace_id, column_id, order_key)` — главный индекс рендера колонки.
- `tasks (workspace_id, project_id, archived_at)` — выборка по проекту.
- `tasks (parent_id)` — подзадачи.
- `comments (task_id, created_at)`.
- `columns (board_id, order_key)`.
- `memberships (user_id)`.
- FTS5 индекс на `tasks_fts`.

---

## 5. UI / UX

### 5.1 Дизайн-токены (flat-стиль)

- Палитра: нейтральная база `zinc` (0–950), один акцентный (например `indigo-600`).
- Цвета колонок/меток — заранее заданный набор из ~10 OKLCh-цветов: `slate, gray, red, orange, amber, green, teal, cyan, blue, violet, pink`. Хранятся в коде как `LABEL_COLORS: { slug, label, hex }[]`.
- Тени почти нет (`shadow-sm` максимум). Разделение через `border` и `bg`.
- Радиус: компонент = `rounded-lg`, ввод/кнопка = `rounded-md`.
- Типографика: Geist Sans (уже подключен), плотный rhythm (`leading-tight`).

### 5.2 Главные экраны

1. `/login`, `/register`.
2. `/workspaces` — выбор / создание workspace.
3. `/w/[ws]/projects` — сетка проектов.
4. `/w/[ws]/p/[project]` — доска (главный экран).
5. `/w/[ws]/p/[project]/settings` — настройки проекта, колонки, метки.
6. `/w/[ws]/settings/{members,labels,profile}`.

### 5.3 Доска

- Горизонтальный скролл, ширина колонки 280–320px, отступ 12px.
- Заголовок колонки: цветная полоска слева (4px), название, счётчик задач, кнопка «+ задача», меню «⋯».
- Карточка задачи:
  - Левая цветная полоска = цвет метки задачи.
  - Заголовок 14px medium, ниже строка метаданных: приоритет (иконка), тип (текст), дедлайн (chip, краснеет при просрочке), счётчик подзадач/комментариев.
  - Hover → подсвечивается, появляется иконка ⋯ (DropdownMenu shadcn): цвет / подзадача / архив / удалить.

### 5.4 Модалка задачи (`TaskDialog`)

- Открывается через `/.../board?task=<id>` (intercepting route) → шарится URL'ом.
- Слева: заголовок (inline-edit), описание (Markdown через `react-markdown` + Tiptap позже), список подзадач, лента комментариев.
- Справа: статус (колонка-селектор), исполнитель, дедлайн, приоритет, тип, цвет, метки, кнопки архивировать/удалить.

### 5.5 Drag-and-drop UX

- Hover-плейсхолдер с пунктирной рамкой.
- Auto-scroll контейнера при перетаскивании к краю.
- Клавиатурный режим: `Space` берёт карточку, стрелки двигают, `Space` отпускает (это даёт нам dnd-kit «из коробки»).

### 5.6 Доступность

- Все интерактивы — кнопки/линки, не div'ы.
- Контрастность ≥ AA. Цвет метки — это **дополнение**, основная информация — текст.
- `prefers-reduced-motion` отключает анимации перетаскивания.

---

## 6. Безопасность

- Server Actions достижимы по прямому POST → каждое действие начинается с `await requireUser()` + RBAC-проверки.
- Никогда не доверяем `workspace_id` / `column_id` из формы без проверки принадлежности.
- Rate-limit (LRU + token bucket) — простой `lib/rate-limit.ts` для логина и комментариев.
- Параметризованные запросы — даёт Drizzle.
- CSP-заголовок в `next.config.ts`.
- В планах — CSRF: Next.js Server Actions имеют встроенную защиту через Origin-чек.

---

## 7. Тестирование

| Уровень       | Что тестируем                                          | Инструмент    |
| ------------- | ------------------------------------------------------ | ------------- |
| Unit          | `services/*` и `domain/*` (ordering, permissions)      | Vitest        |
| DB-integration| Drizzle-запросы против реальной in-memory SQLite       | Vitest + better-sqlite3 `:memory:` |
| Server Action | Прогон Action с моком actor                            | Vitest        |
| E2E (опц.)    | Логин → создать проект → добавить колонку → DnD → закрыть | Playwright |

Минимум на MVP: unit для ordering и permissions + один интеграционный тест move-task.

---

## 8. Дорожная карта (этапы)

> Каждый этап заканчивается **рабочим, демонстрируемым** состоянием. Ничего не оставляем «наполовину».

### Этап 0. Фундамент (½ дня)
- [ ] Установить и настроить: drizzle, better-sqlite3, drizzle-kit, zod, lucide-react, dnd-kit, react-hook-form, date-fns, fractional-indexing.
- [ ] Завести shadcn/ui (`npx shadcn@latest init`), добавить базовые компоненты: button, input, dialog, dropdown-menu, popover, tooltip, select, textarea, label, separator, badge, scroll-area, toast.
- [ ] `src/db/index.ts` с подключением к `data/app.db`.
- [ ] `.env.local`, `.gitignore` (`*.db`, `*.db-journal`).
- [ ] `scripts/db.ts`: команды `generate`, `migrate`, `studio`.
- [ ] Удалить дефолтный контент `app/page.tsx`, оставить лэндинг-заглушку → редирект на `/login`/`/w`.
- [ ] CI-чек: `pnpm lint && pnpm typecheck`.

### Этап 1. Аутентификация и workspaces (1 день)
- [ ] Подключить Better Auth, конфиг в `src/lib/auth.ts`.
- [ ] Схема users/sessions/accounts/verification.
- [ ] Страницы `/login`, `/register`, кнопка logout.
- [ ] Middleware: незалогиненных кидаем на `/login`.
- [ ] Workspace + Membership: при первом входе создаётся «Personal workspace».
- [ ] `/workspaces` со списком и переключением.
- [ ] RBAC-хелперы `requirePermission`.

### Этап 2. Проекты и доска (1 день)
- [ ] CRUD проектов (create, rename, archive).
- [ ] Один board на проект (создаётся автоматически).
- [ ] Стартовые колонки по шаблону «Задача / В работе / Готово» при создании проекта.
- [ ] Страница доски: пустое состояние + рендер колонок без задач.
- [ ] Создание/переименование/удаление колонок, выбор цвета из палитры.
- [ ] Drag-n-drop **колонок** (горизонтальный, fractional-key).

### Этап 3. Задачи: базовый CRUD (1 день)
- [ ] Модель `tasks` + индексы + FTS-таблица (пока без UI поиска).
- [ ] Создание задачи прямо в колонке (inline-форма «+ задача»).
- [ ] Карточка задачи на доске (минимум: title, цвет, иконки).
- [ ] Архив/удаление задачи.

### Этап 4. Drag-n-drop задач (½ дня)
- [ ] `@dnd-kit/sortable` внутри колонки.
- [ ] Кросс-колоночный перенос.
- [ ] `useOptimistic` + Server Action `moveTask`.
- [ ] ActivityEvent на каждом перемещении.

### Этап 5. Карточка задачи: полный детал (1.5 дня)
- [ ] Intercepting route `/.../board/@modal/(.)task/[id]`.
- [ ] Полная форма: title, description, type, priority, color, due_at, assignee, labels.
- [ ] Подзадачи (создать/удалить/чекбокс-выполнено).
- [ ] Комментарии (создать/удалить/редактировать-в-течение-5-минут).
- [ ] Лента истории (читаем из `activity_events`).
- [ ] Меню ⋯ на карточке: цвет / подзадача / архив / удалить — все действия работают.

### Этап 6. Метки и фильтры (½ дня)
- [x] Палитра меток workspace в настройках.
- [x] Привязка меток к задаче.
- [x] Фильтры на доске: по метке / приоритету / поиск по тексту (FTS5). Фильтр по исполнителю отложен (см. Decision log).

### Этап 7. Полировка (½ дня)
- [x] Empty states, скелетоны при загрузке.
- [x] Hotkeys: `?` — список шорткатов, `c` — новая задача, `g p` — к проектам.
- [x] Toaster для успеха/ошибок (уже подключён в root layout с Этапа 0–1).
- [x] Адаптив до 768px (доска скроллится горизонтально, шапка workspace переносится, role-чип скрыт).
- [x] prefers-reduced-motion отключает анимации/transitions глобально.

### Этап 8. Подготовка к будущему (½ дня)
- [ ] Скелет realtime (`/api/stream/[boardId]` через SSE, отправляет только «invalidate boardId»).
- [ ] Скелет интеграций: таблица `integrations` + страница «Интеграции» с заглушками Slack/GitHub.
- [ ] Документ `docs/extending.md`: как добавить новое поле задачи, новый тип события, новую интеграцию.

---

## 9. Risk log

| Риск                                                                | Митигация                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| SQLite-блокировки на одновременной записи                           | `journal_mode=WAL`, `synchronous=NORMAL`, короткие транзакции.            |
| Server Actions и one-at-a-time лимит (см. Next.js 16 docs)          | Тяжёлые батчи — внутри одного Action, не дробить.                         |
| Cascade-обновление order при сбое алгоритма fractional-indexing     | На каждый Nой move запускаем `reindex` колонки (пересборка ключей).       |
| Утечка данных между workspaces                                      | Линт-правило: запрет на db-вызовы вне `services`; `services` требует actor.|
| Лишние ре-рендеры при DnD                                           | Карточка = `memo`, селекторы из стора через `useShallow`.                 |

---

## 10. Decision log

> Сюда дозаписываем все «развилки», где выбор не очевиден.

- **2026-05-22 — ORM**: выбран Drizzle. Причина: TS-first, лёгкий рантайм, удобные миграции, отлично работает с `better-sqlite3` и Server Actions.
- **2026-05-22 — DnD**: выбран `@dnd-kit`. Причина: совместимость с React 19, индустриальный стандарт, есть `sortable`, клавиатура и a11y.
- **2026-05-22 — Auth**: выбран Better Auth. Причина: плагин `organization` закрывает workspaces+invites+роли, активная разработка, TS-first.
- **2026-05-22 — Sorting**: fractional indexing (LexoRank-like) вместо integer `position`. Причина: один UPDATE на move, нет каскадов.
- **2026-05-22 — Подзадачи**: через `tasks.parent_id` (self-reference), а не отдельная таблица `subtasks`. Причина: одинаковый API, легче делать «продвижение подзадачи в задачу».
- **2026-05-22 — Workspace = Better Auth organization**: вместо собственных таблиц `workspaces / memberships` используем `organization / member / invitation` от плагина `organization`. Семантика та же, имена другие. В URL остаётся `/w/[slug]`. Это даёт invites/роли «из коробки». MVP-роли: `owner / admin / member`; `viewer` (см. `domain/types.ts`) добавим позже через AccessControl-плагин better-auth.
- **2026-05-22 — Структура каталогов**: shadcn положил всё в корень — оставили flat-структуру (`components/`, `lib/`, `db/`, `domain/`, `services/`, `actions/`, `app/`), без `src/`. PLAN.md §3.1 описывает идею, фактическое расположение — без `src/` префикса.
- **2026-05-22 — DB-клиент**: `db/client.ts` — чистый (для scripts/CLI), `db/index.ts` — обёртка с `import "server-only"` для app-кода. Это избегает падений в tsx-скриптах.
- **2026-05-22 — FTS5 откладывается на Этап 6**: чтобы не плодить ручные SQL-миграции (drizzle-kit FTS5 не генерит) и не тянуть лишнего, виртуальная таблица `tasks_fts` и триггеры будут созданы в одной миграции вместе со схемой меток. PLAN.md §8 этап 6 уже подразумевает добавление поиска.
- **2026-05-22 — ActivityEvent откладывается на Этап 5**: запись `task.move` в `activity_events` обещалась в §8 Этап 4. Самой таблицы ещё нет — она появится вместе с UI ленты истории в карточке задачи. Сейчас перемещения не логируются, добавим в одном PR с историей.
- **2026-05-23 — FTS5 включён в миграции вместе с метками**: миграция `0004_warm_ultimo.sql` помимо `labels` / `task_labels` создаёт виртуальную `tasks_fts` (external content на `tasks`, токенизатор `unicode61 remove_diacritics 2`) и три триггера синхронизации. Backfill уже существующих задач выполняется в той же миграции. Запросы поиска идут через `services/search.ts:searchTaskIds` с экранированием токенов в префиксные фразовые поиски `"foo"*`.
- **2026-05-23 — Фильтр по исполнителю отложен**: задумывался в §8 Этап 6, но UI назначения исполнителя из Этапа 5 не реализован — фильтровать пока не по чему. Вернёмся к нему вместе с селектором исполнителя (Этап 7 «Полировка» или раньше, по запросу).

---

## 11. Что НЕ делаем (явные «нет»)

- Не пишем самописный auth.
- Не используем `react-beautiful-dnd` (deprecated, неясная совместимость с React 19).
- Не делаем real-time на старте: SSE/WebSocket добавляем позже, когда понадобится presence.
- Не делаем тёмную тему в UI-переключателе — только через `prefers-color-scheme`.
- Не вводим оффлайн-режим / CRDT в MVP.

---

## 12. Следующий шаг

После согласования плана:
1. Этап 0 (фундамент).
2. По итогам этапа — короткое демо/скрин, фиксируем в Decision log что отклонилось.
3. Переход к Этапу 1.

Чек-листы в §8 — наш единый источник правды по прогрессу.
