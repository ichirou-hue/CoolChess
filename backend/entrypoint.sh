#!/bin/sh
set -e

echo "Applying database migrations..."
alembic upgrade head

echo "Starting Uvicorn server..."
exec uvicorn server:app --host 0.0.0.0 --port 8000 --workers 2 --forwarded-allow-ips "*"