#!/bin/sh
set -e

echo "Applying database migrations..."
alembic upgrade head

echo "Starting Uvicorn server (single worker: PvP-комнаты живут в памяти процесса)..."
exec uvicorn server:app --host 0.0.0.0 --port 8080 --workers 1 --forwarded-allow-ips "*"
