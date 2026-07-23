#!/bin/sh
# Дамп Postgres из docker-compose стека + ротация старых бэкапов.
#   ./scripts/docker-backup.sh
#   ./scripts/docker-backup.sh 30   # хранить 30 дней вместо дефолтных 14
#
# Для автоматического запуска — cron на хосте (не внутри контейнера):
#   0 3 * * * cd /path/to/task-tracker && ./scripts/docker-backup.sh >> backups/backup.log 2>&1
set -e

KEEP_DAYS="${1:-30}"
cd "$(dirname "$0")/.."
mkdir -p backups

STAMP=$(date +%Y%m%d-%H%M%S)
FILE="backups/tasktracker-${STAMP}.sql.gz"

docker compose exec -T postgres pg_dump -U tasktracker tasktracker | gzip > "$FILE"
echo "✔ Бэкап сохранён: $FILE ($(du -h "$FILE" | cut -f1))"

find backups -name 'tasktracker-*.sql.gz' -mtime "+${KEEP_DAYS}" -delete
echo "✔ Бэкапы старше ${KEEP_DAYS} дн. удалены"
