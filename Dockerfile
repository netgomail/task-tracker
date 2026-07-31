# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# ↑ BETTER_AUTH_SECRET ниже — не настоящий секрет, а статичная заглушка
# только для прохождения zod-валидации при сборке (см. комментарий у ENV).
# Стадия builder отбрасывается в multi-stage build, в runner она не попадает.

# ---------- deps: установка всех зависимостей (incl. native better-sqlite3) ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# инструменты для сборки нативных модулей (better-sqlite3 — legacy, но в deps есть)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder: сборка Next.js в standalone ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# env.ts валидирует переменные при импорте. Сборка не ходит в БД,
# но переменные должны пройти zod-схему — подставляем заглушки.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV BETTER_AUTH_SECRET=build_secret_build_secret_build_secret_32
RUN npm run build

# ---------- runner: минимальный production-образ ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# gosu — чтобы entrypoint мог стартовать от root (починить права на смонтированный
# том вложений), а сам процесс Node всё равно запустить от nextjs, не от root.
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
 && rm -rf /var/lib/apt/lists/*

# Standalone-сервер Next.js + статика + public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Миграции БД + раннер (drizzle-миграции требуют полный drizzle-orm + postgres)
COPY --from=builder /app/src/db/migrations ./src/db/migrations
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps /app/node_modules/postgres ./node_modules/postgres
COPY docker-migrate.mjs ./docker-migrate.mjs
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Каталог вложений — монтируется томом из docker-compose. chown здесь работает
# только для содержимого образа: если хост примонтирует поверх свою (root-owned)
# директорию, права чинит entrypoint при старте контейнера (см. docker-entrypoint.sh).
RUN mkdir -p /app/data/attachments && chown -R nextjs:nodejs /app/data

# Контейнер стартует от root — это нужно entrypoint'у, чтобы chown'ить
# смонтированный volume. Сам процесс Node всё равно запускается от nextjs
# (через gosu в entrypoint), root тут не выполняет прикладной код.
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
