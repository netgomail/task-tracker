# syntax=docker/dockerfile:1

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

# Каталог вложений — монтируется томом из docker-compose
RUN mkdir -p /app/data/attachments && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
