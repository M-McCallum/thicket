.PHONY: dev dev-up dev-down test test-backend test-frontend test-web lint lint-backend lint-frontend build build-web migrate-up migrate-down seed sec-scan dev-web register-clients

# Development
dev-up:
	docker compose -f docker-compose.dev.yml up -d

dev-down:
	docker compose -f docker-compose.dev.yml down

dev-backend:
	cd backend && go run ./cmd/server

dev-frontend:
	cd frontend && npm run dev

dev-web:
	cd web && npm run dev

dev: dev-up
	@echo "Dev services started. Run 'make dev-backend' and 'make dev-frontend' or 'make dev-web' in separate terminals."

# Testing
test: test-backend test-frontend test-web

test-backend:
	cd backend && go test -race -cover ./...

test-frontend:
	cd frontend && npm run test

test-web:
	cd web && npm run test

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

build-web:
	cd web && npm run build

build: build-backend build-frontend build-web

# Database
migrate-up:
	cd backend && go run ./cmd/migrate up

migrate-down:
	cd backend && go run ./cmd/migrate down

seed:
	./scripts/seed.sh

# OAuth2 clients
register-clients:
	./ory/register-clients.sh

# Security
sec-scan:
	cd backend && gosec ./...
	cd backend && govulncheck ./...
	cd frontend && npm audit
	cd web && npm audit
