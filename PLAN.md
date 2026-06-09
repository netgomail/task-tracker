# PLAN — Синхронизация с Obsidian

Интеграция таск-трекера и Obsidian: документы ОРД пишутся в Obsidian, статус/стадии/сроки/связи живут в трекере. Транспорт — **кастомный Obsidian-плагин + REST API**. Направление — **Obsidian владеет контентом, трекер владеет статусом** (field-level ownership, конфликтов по полю нет by design).

Каждый этап = отдельный коммит (см. каденс коммитов). Без соавторства.

---

## Модель соответствия

| Трекер | Obsidian | Носитель связи |
|---|---|---|
| `organization` (пространство) | vault | `workspace:` |
| `projects` (тема/комплект ОРД) | папка `Темы/<slug>/` + индекс-MOC | `theme:` = `projects.slug` |
| `tasks` (документ ОРД) | заметка `.md` | `tracker_id:` (якорь) |
| `columns` (стадия) + `completedAt` | `status:` / `stage:` (зеркало, RO) | поле |
| `task_links` (requires/approves/...) | `[[wikilinks]]` | `links:` |
| `labels` (типы с иконками) | `tags:` | поле |
| `dueAt` / `reviewAt` / `completedAt` | `due` / `review` / `completed` (RO) | поле |
| `attachments` (.docx, NAS) | ссылка на NAS-путь | не дублируем |

Стадии (колонки доски): `Не начато → Разработка проекта → Согласование → Утверждение → Ввод в действие → Ознакомление → Готово`.
`status` (производное): `not_started` (колонка «Не начато») / `done` (`completedAt` задан) / `in_progress` (иначе).

## Владение полями (источник истины)

| Поле | Владелец | Поведение |
|---|---|---|
| тело заметки, имя файла, существование | **Obsidian** | сервер не трогает; create→задача, delete→soft `archivedAt` |
| `tags`→labels, `[[links]]`→task_links | **Obsidian** | сервер применяет к задаче (идемпотентно) |
| `stage/status`, `due`, `review`, `priority`, `assignee`, `completedAt` | **Трекер** | пишутся во frontmatter **read-only** |
| `tracker_id` | двусторонний якорь | пишет сервер при первом upsert, хранит заметка |

## Контракт frontmatter

```yaml
---
tracker_id: tsk_abc123          # якорь; пусто → сервер создаёт задачу и вернёт id
workspace: mbdou-umka-ib
theme: parolnaya-politika       # projects.slug (обязателен для синхронизации)
status: in_progress             # RO, производное
stage: "Согласование"           # RO, columns.name
type: [инструкция, ПДн]         # кастомное свойство List → labels (НЕ спец. tags)
priority: high                  # RO
due: 2026-07-01                 # RO
review: 2027-06-01              # RO, срок пересмотра ОРД
completed: null                 # RO
assignee: denis                 # RO
links:                          # → task_links (тип связи из текста/секции)
  - "[[Приказ об утверждении парольной политики]]"
tracker_updated: 2026-06-09T12:00:00Z
tracker_url: https://tracker.local/t/tsk_abc123
---
```

Заметка без `theme:` синхронизацией игнорируется (обычная заметка Obsidian).

### Свойства Obsidian (Properties) = этот frontmatter

Контракт реализуется нативными «Свойствами» Obsidian (frontmatter с типами, начиная с 1.4). Отдельного механизма не нужно — пользователь видит и правит поля как Свойства. Типы:

| Поле | Тип свойства | Владелец |
|---|---|---|
| `tracker_id` | Text | якорь |
| `theme` | Text | Obsidian |
| `status`, `stage`, `priority`, `assignee` | Text | трекер (RO) |
| `due`, `review`, `completed` | **Date** | трекер (RO) |
| `type` | **List** (кастомное, не спец. `tags`) | Obsidian |
| `links` | **List of links** (`[[...]]`) | Obsidian |
| `tracker_updated` | **Date & time** | служебное |

Решения:
- **`type` — кастомное свойство List, спец. `tags` не используем.** Иначе типы ОРД смешаются с остальными тегами хранилища и графом тегов. Изоляция чище.
- **`links` как List of links** даёт нативные backlinks и Graph View → комплектность ОРД (`task_links`) визуализируется графом бесплатно.
- **`due/review/completed` — тип Date**, чтобы пересмотр/дедлайны были сортируемыми и фильтруемыми нативным поиском (`["review":< 2026-07-01]`) и Bases/Dataview, а не строками.
- **«Read-only» — соглашение, не функция Obsidian.** RO-свойства технически правятся руками; трекер (владелец) перезаписывает их при следующей синхронизации. Защита от войны правок — анти-эхо из Этапа 6.

---

## Этапы

### Этап 1 — Схема: привязка задачи к заметке + токен синхронизации
- Миграция: `tasks.obsidian_path text` (nullable, vault-относительный путь; для обратной записи и детекта переименований — якорь всё равно `tracker_id`).
- Новая таблица `sync_tokens` (id, workspaceId, userId, name, tokenHash, lastUsedAt, createdAt, revokedAt). Долгоживущий персональный токен для плагина — не зависим от 30-дневной сессии better-auth.
- Drizzle-схема + `db:generate` + миграция, экспорт в `schema/index.ts`.
- **Коммит:** `feat(sync): схема obsidian_path + sync_tokens`.

### Этап 2 — Аутентификация плагина (Bearer-токен)
- `src/lib/sync-auth.ts`: `verifySyncToken(req)` → `{ userId, workspaceId }` по `Authorization: Bearer`; sha-256 сверка с `tokenHash`, обновление `lastUsedAt`, проверка `revokedAt`.
- UI выпуска токена: в профиле/настройках workspace — создать/отозвать (показываем секрет один раз). Server action в `src/actions/sync.ts`.
- **Коммит:** `feat(sync): персональные токены синхронизации + UI выпуска`.

### Этап 3 — Sync-сервис (reconcile)
- `src/services/sync.ts`:
  - `resolveTheme(workspaceId, slug)` → project (нет темы → ошибка `theme_not_found`, проект не создаём).
  - `upsertFromNote({ workspaceId, userId, path, frontmatter, title, tags, links })`:
    - нет `tracker_id` → создать task в колонке «Не начато», вернуть id;
    - есть — обновить `title`, `obsidian_path`; **тело/стадию/сроки не трогаем** (Obsidian не владеет ими).
    - `tags` → upsert labels + sync `task_labels` (diff, идемпотентно).
    - `links` (по имени заметки → task по `obsidian_path`/title в этой теме) → sync `task_links` (тип по умолчанию `relates`; уточнить маппинг секций → requires/approves в Этапе 6).
  - `serializeForNote(taskId)` → трекерные поля для записи во frontmatter (`stage/status/due/review/completed/priority/assignee/tracker_url/tracker_updated`).
  - `deleteNote(path)` → soft-archive (`archivedAt`), без каскада.
  - `changedSince(workspaceId, sinceIso)` → задачи с `updatedAt > since` для обратного канала.
- Юнит-проверка идемпотентности (повторный upsert не плодит labels/links).
- **Коммит:** `feat(sync): reconcile-сервис заметка↔задача`.

### Этап 4 — REST API (route handlers)
- `runtime="nodejs"`, `dynamic="force-dynamic"`, `params: Promise` — по конвенциям проекта.
- `POST /api/obsidian/upsert` → `verifySyncToken` → `services/sync.upsertFromNote` → возвращает `{ tracker_id, fields }` (плагин пишет id + RO-поля во frontmatter). По завершении — `notifyBoard(boardId)`.
- `POST /api/obsidian/delete` → soft-archive.
- `GET /api/obsidian/changes?since=` → `changedSince` (поллинг-фолбэк, если SSE недоступен из плагина).
- Все ответы — `Response.json`; ошибки доменные (`theme_not_found` → 422 с понятным текстом для плагина).
- **Коммит:** `feat(sync): REST API /api/obsidian/*`.

### Этап 5 — Realtime обратный канал (статус → Obsidian)
- Переиспользовать `lib/realtime.ts` (синглтон на `globalThis` — Turbopack-dev). Добавить `notifyWorkspace`/канал по workspace либо подписку по boardId, на который смотрит плагин.
- `GET /api/obsidian/stream` (SSE, Bearer-auth) — пинок «перечитай changes». При смене стадии на доске action вызывает notify → плагин дёргает `/changes` → переписывает frontmatter у затронутых заметок.
- Фолбэк: поллинг `/changes` раз в N сек, если SSE не держится.
- **Коммит:** `feat(sync): SSE-канал статус→Obsidian`.

### Этап 6 — Obsidian-плагин (отдельный репозиторий/папка `obsidian-plugin/`)
- TS + esbuild, один `main.ts`. Настройки: `baseUrl`, `token`, `workspace`.
- Watcher `vault.on("modify"|"create"|"rename"|"delete")` → debounce → `upsert`/`delete`. Шлём только заметки с `theme:`. **Тело не отправляем.**
- После ответа — записать `tracker_id` и RO-поля во frontmatter (`app.fileManager.processFrontMatter`).
- Подписка на `/api/obsidian/stream` (или поллинг `/changes`) → переписать RO-поля в затронутых заметках.
- Команды: «Открыть карточку в трекере», «Принудительная синхронизация заметки».
- Защита от эхо-петли: запись RO-полей сервером не должна триггерить новый upsert (флаг «своя запись» / сравнение хэша frontmatter).
- **Коммит:** `feat(sync): obsidian-плагин (watcher + frontmatter + realtime)`.

### Этап 7 — Зеркало комплектности (темы/проекты → Obsidian)
- Команда плагина «Сгенерировать MOC темы»: индекс-заметка `Темы/<slug>/<slug>.md` с таблицей документов темы (стадия, срок пересмотра, пробелы) — зеркало `/readiness` внутри Obsidian.
- **Bases vs Dataview** для таблиц «реестр»/«готовность»: Bases (core-плагин, таблицы поверх свойств) предпочтительнее — нативно, без зависимости от Dataview, использует уже типизированные свойства (`status`, `review` как Date). Решить в начале этапа, выбрать одно.
- Граф: `links` (List of links) уже дают визуализацию комплектности (requires/approves) в Obsidian Graph View.
- **Коммит:** `feat(sync): MOC тем + зеркало готовности (Bases)`.

---

## Краевые случаи (заложить в reconcile)
- **Переименование/перемещение файла** — привязка по `tracker_id`, не по пути; `obsidian_path` обновляем.
- **Удаление** — soft `archivedAt`, не каскад (история ОРД важна для ИБ/ПДн).
- **`.docx`-вложения (47 на NAS)** — заметка ссылается на NAS-путь, контент не дублируется.
- **Эхо-петля** — запись RO-полей сервером ≠ новый upsert.
- **Идемпотентность** — повторный save не плодит labels/links.
- **Дрейф/конфликт** — сверка `tracker_updated` vs `tasks.updatedAt`; владелец поля выигрывает всегда.
- **Resolve `theme:`** — нет темы → явная ошибка в плагине, проект не создаём автоматически.

## Открытые вопросы (решить по ходу)
- Маппинг типа связи `task_links` из Obsidian: по секции (`## Требует`, `## Утверждает`) или по умолчанию `relates` с ручным уточнением в трекере?
- `stage` во frontmatter дословно по `columns.name` или нормализованный `status`? (план: храним оба — `stage` для человека, `status` для запросов Bases/Dataview).
- Один vault = одно пространство (старт) vs папка-на-пространство.
- **Bases vs Dataview** для таблиц в Этапе 7 (склоняемся к Bases — нативно, типизированные свойства).

## Решено
- `type` — кастомное свойство List, спец. `tags` Obsidian не используем (изоляция типов ОРД от прочих тегов).
- `links` — свойство List of links (нативные backlinks + Graph View для комплектности).
- `due/review/completed` — тип свойства Date (сортировка/фильтр).
- RO-свойства — соглашение; владелец-трекер перезаписывает их при синхронизации (анти-эхо в Этапе 6).
