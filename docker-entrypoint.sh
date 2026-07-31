#!/bin/sh
set -e

# Bind-mount ./data/attachments (в .gitignore, на свежем сервере его нет)
# Docker создаёт от root при первом `docker compose up` — nextjs (uid 1001)
# не сможет туда писать. Чиним права здесь, пока мы ещё root, и дальше
# запускаем миграции/сервер уже от nextjs через gosu.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data/attachments
  chown -R nextjs:nodejs /app/data/attachments
  RUN_AS="gosu nextjs"
else
  RUN_AS=""
fi

echo "→ Applying database migrations…"
$RUN_AS node docker-migrate.mjs

echo "→ Starting Next.js server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}…"
exec $RUN_AS node server.js
