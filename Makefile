.PHONY: dev dev-up dev-down test test-backend test-frontend lint lint-backend lint-frontend build migrate-up migrate-down seed sec-scan

# Development
dev-up:
	docker compose -f docker-compose.dev.yml up -d

dev-down:
	docker compose -f docker-compose.dev.yml down

dev-backend:
	cd backend && go run ./cmd/server

dev-frontend:
	cd frontend && npm run dev

dev: dev-up
	@echo "Dev services started. Run 'make dev-backend' and 'make dev-frontend' in separate terminals."

# Testing
test: test-backend test-frontend

test-backend:
	cd backend && go test -race -cover ./...

test-frontend:
	cd frontend && npm run test

# Linting
lint: lint-backend lint-frontend

lint-backend:
	cd backend && go vet ./...
	cd backend && gosec ./...

lint-frontend:
	cd frontend && npm run lint
	cd frontend && npm run type-check

# Build
build-backend:
	cd backend && go build -o bin/server ./cmd/server

build-frontend:
	cd frontend && npm run build

build: build-backend build-frontend

# Database
migrate-up:
	cd backend && go run ./cmd/migrate up

migrate-down:
	cd backend && go run ./cmd/migrate down

seed:
	./scripts/seed.sh

# Security
sec-scan:
	cd backend && gosec ./...
	cd backend && govulncheck ./...
	cd frontend && npm audit
