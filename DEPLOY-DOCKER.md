# Запуск в Docker (любой компьютер)

Один `docker-compose.yml` поднимает **оба** сервиса: Postgres (`tasktracker-db`) и
само приложение (`task-tracker`) — полностью самодостаточно, без подключения к
внешней/удалённой базе. Работает одинаково на macOS/Windows (Docker Desktop) и
Linux — обычная bridge-сеть, никаких host-network или абсолютных путей к диску.

Приложение собирается в минимальный self-contained образ (Next.js
`output: standalone`) и хранит вложения задач в смонтированном томе. Миграции БД
применяются автоматически при старте (после того как Postgres станет healthy).

## 1. Подготовить переменные окружения

```bash
cp .env.docker.example .env.docker
```

Заполни `.env.docker`:

- `POSTGRES_PASSWORD` — пароль БД как есть (получит контейнер Postgres).
- `DATABASE_URL` — тот же пароль, но URL-кодированный, если есть спецсимволы.
  Хост в строке — `postgres` (имя сервиса), редактировать не нужно.
- `BETTER_AUTH_SECRET` — `openssl rand -base64 32`.
- `BETTER_AUTH_URL` — `http://localhost:3000` для локального запуска, либо
  `http://<IP-или-домен-машины>:3000`, если открываешь с другого устройства в сети.
- `DISABLE_REGISTRATION=1` — закрыть самостоятельную регистрацию после того,
  как завёл нужные аккаунты (рекомендуется).
- `TRUSTED_PROXY=1` — только если перед приложением стоит reverse-proxy
  (nginx/Caddy), перезаписывающий `X-Forwarded-For`.

## 2. Собрать и запустить

```bash
docker compose build
docker compose up -d          # поднимет postgres, дождётся healthy, затем app
docker compose logs -f        # видно "✔ migrations applied" и старт сервера
```

Открыть: `http://localhost:3000` (или тот адрес, что указал в `BETTER_AUTH_URL`).

## 3. Данные

- **База данных** — именованный Docker-volume `postgres_data`. Живёт до явного
  `docker compose down -v`; обычный `down`/`up` его не трогает.
- **Вложения задач и аватары** — `./data/attachments` рядом с проектом (обычный
  bind-mount, видно и с хоста).

## 4. Бэкапы (чтобы не потерять данные)

Volume `postgres_data` переживает `docker compose down`/`up`/`restart`/пересборку —
но не переживёт случайный `down -v`, падение диска или переустановку Docker.
Это не бэкап сам по себе, нужен отдельный дамп.

```bash
npm run db:backup-docker              # хранит бэкапы 14 дней (по умолчанию)
npm run db:backup-docker -- 30        # хранить 30 дней
```

Сохраняет `backups/tasktracker-<дата>.sql.gz` через `pg_dump` внутри контейнера
и удаляет то, что старше срока хранения. `backups/` не в гите (там были бы токены
сессий) — сохраняй эти файлы отдельно (внешний диск, другой хост, облако).

Для автоматических регулярных бэкапов — cron на хосте (не внутри контейнера):

```bash
crontab -e
# каждую ночь в 3:00
0 3 * * * cd /path/to/task-tracker && ./scripts/docker-backup.sh >> backups/backup.log 2>&1
```

**Восстановление** из дампа (например, на новой машине после переноса):

```bash
gunzip -c backups/tasktracker-20260723-030000.sql.gz | docker compose exec -T postgres psql -U tasktracker tasktracker
```

Вложения задач и аватары (`./data/attachments`) — обычные файлы на хосте, бэкапь
их своим обычным способом (rsync/Time Machine/что угодно):

```bash
rsync -a ./data/attachments/ /путь/для/бэкапа/attachments/
```

## 5. Обновление версии

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
- `app` и `postgres` общаются по имени сервиса во внутренней docker-сети
  (`postgres:5432`); порт `5433:5432` наружу — только для подключения с хоста
  локальным `psql`/GUI-клиентом, приложению он не нужен.
