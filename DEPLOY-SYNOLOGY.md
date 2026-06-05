# Запуск на Synology (Docker / Container Manager)

Один `docker-compose.yml` поднимает **оба** сервиса: Postgres (`tasktracker-db`) и
само приложение (`task-tracker`). Приложение собирается в минимальный self-contained
образ (Next.js `output: standalone`) и хранит вложения в смонтированном томе.
Миграции БД применяются автоматически при старте (после того как Postgres станет
healthy).

## 0. Предпосылки

- На NAS установлен **Container Manager** (DSM 7.2+) или пакет **Docker**.
- Каталог для данных БД на NAS: `/volume1/docker/tasktracker-db` (создаётся при
  первом запуске; туда складывается PGDATA тома Postgres 18).

## 1. Подготовить переменные окружения

```bash
cp .env.docker.example .env.docker
```

Заполни `.env.docker`:

- `POSTGRES_PASSWORD` — пароль БД **как есть** (его получит контейнер Postgres).
- `DATABASE_URL` — тот же пароль, но **URL-кодированный** (`@`→`%40`, `?`→`%3F`,
  `+`→`%2B`, …). Хост `127.0.0.1`, порт `5433`: приложение в host-сети достаёт
  Postgres по опубликованному порту через loopback самого NAS.
- `BETTER_AUTH_SECRET` — `openssl rand -base64 32`.
- `BETTER_AUTH_URL` — `http://NAS_IP:3000` (ровно тот URL, по которому открываешь).
- `GOOGLE_CLIENT_ID/SECRET` — опционально; в Google Cloud Console добавь redirect URI
  `http://NAS_IP:3000/api/auth/callback/google`.

## 2. Собрать и запустить

Через SSH на NAS, из каталога проекта:

```bash
docker compose build
docker compose up -d          # поднимет postgres, дождётся healthy, затем app
docker compose logs -f        # видно "✔ migrations applied" и старт сервера
```

Открыть: `http://NAS_IP:3000`.

### Вариант через Container Manager (GUI)

1. Загрузить проект на NAS (File Station / git).
2. Container Manager → **Project** → **Create** → указать каталог с `docker-compose.yml`.
3. Создать `.env.docker` рядом (см. шаг 1) и нажать **Build** → **Run**.

## 3. Вложения

Файлы задач хранятся в `/app/data/attachments` внутри контейнера и проброшены на хост
через том в `docker-compose.yml`. Для удобства можно заменить относительный путь на
абсолютный том Synology:

```yaml
volumes:
  - /volume1/docker/task-tracker/attachments:/app/data/attachments
```

Если переносишь существующие вложения со старой машины — скопируй их в этот каталог.

## 4. Обновление версии

```bash
git pull
docker compose build
docker compose up -d
```

Миграции применятся автоматически (идемпотентно — уже применённые пропускаются).

## Как это устроено

- `Dockerfile` — multi-stage: `deps` (npm ci) → `builder` (`next build` → standalone)
  → `runner` (slim-образ только с сервером, статикой, миграциями и драйвером БД).
- `docker-entrypoint.sh` — сначала `node docker-migrate.mjs`, затем `node server.js`.
- `docker-migrate.mjs` — самостоятельный Drizzle-мигратор (без tsx/исходников).
