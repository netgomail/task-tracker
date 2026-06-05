#!/bin/sh
set -e

echo "→ Applying database migrations…"
node docker-migrate.mjs

echo "→ Starting Next.js server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}…"
exec node server.js
