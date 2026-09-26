#!/usr/bin/env bash
set -e

# Директория для бэкапов на сервере
BACKUP_DIR="/var/backups/coolchess"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/coolchess_$TIMESTAMP.sql.gz"

# Создаем папку, если ее нет
mkdir -p "$BACKUP_DIR"

echo "=== Создание резервной копии базы данных ==="
docker compose exec -T postgres pg_dump -U postgres coolchess | gzip > "$FILENAME"

echo "Бэкап успешно сохранен: $FILENAME ($(du -h "$FILENAME" | cut -f1))"

# Удаляем бэкапы старше 7 дней (ротация)
echo "=== Очистка старых копий (старше 7 дней) ==="
find "$BACKUP_DIR" -type f -name "coolchess_*.sql.gz" -mtime +7 -delete

echo "Готово."