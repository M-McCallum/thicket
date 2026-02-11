#!/usr/bin/env bash
set -euo pipefail

DIRECTION="${1:-up}"
DATABASE_URL="${DATABASE_URL:-postgres://thicket:thicket_dev@localhost:5432/thicket?sslmode=disable}"

if [ "$DIRECTION" = "up" ]; then
  echo "Running migrations up..."
  migrate -path backend/internal/database/migrations -database "$DATABASE_URL" up
elif [ "$DIRECTION" = "down" ]; then
  echo "Rolling back last migration..."
  migrate -path backend/internal/database/migrations -database "$DATABASE_URL" down 1
elif [ "$DIRECTION" = "drop" ]; then
  echo "Dropping all tables..."
  migrate -path backend/internal/database/migrations -database "$DATABASE_URL" drop -f
else
  echo "Usage: $0 [up|down|drop]"
  exit 1
fi

echo "Done."
