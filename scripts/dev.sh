#!/usr/bin/env bash
set -euo pipefail

echo "Starting NeonCore dev environment..."

# Start Docker services
docker compose -f docker-compose.dev.yml up -d

# Wait for Postgres
echo "Waiting for PostgreSQL..."
until docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U neoncore > /dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL is ready."

# Run migrations
echo "Running migrations..."
cd backend && go run -tags migrate ./cmd/migrate up
cd ..

echo ""
echo "Dev services are running!"
echo "  PostgreSQL: localhost:5432"
echo "  LiveKit:    localhost:7880"
echo ""
echo "Run in separate terminals:"
echo "  make dev-backend    # Go API server"
echo "  make dev-frontend   # Electron app"
