# Thicket

A self-hosted Discord clone with a cyberpunk aesthetic, built as an Electron desktop app.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop App | Electron + React 19 + TypeScript |
| Build Tool | electron-vite 5 |
| Styling | Tailwind CSS |
| State Management | Zustand 5 |
| Backend API | Go 1.25 + Fiber v3 |
| Database | PostgreSQL 16 + pgx v5 |
| Real-time | WebSocket (fasthttp/websocket) |
| Voice/Video | LiveKit (self-hosted) |
| Auth | JWT (access tokens) + refresh tokens in DB |

## Prerequisites

- **Go** 1.25+
- **Node.js** 20+ and npm
- **Docker** and **Docker Compose** (for PostgreSQL and LiveKit)

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/M-McCallum/thicket.git
cd thicket

# 2. Copy environment config
cp .env.example .env

# 3. Start dev services (Postgres + LiveKit)
make dev-up

# 4. Wait for Postgres, then run migrations
make migrate-up

# 5. Install frontend dependencies
cd frontend && npm install && cd ..

# 6. In one terminal — start the Go API server
make dev-backend

# 7. In another terminal — start the Electron app
make dev-frontend
```

Or use the all-in-one dev script which handles steps 3-4:

```bash
./scripts/dev.sh
# Then run make dev-backend and make dev-frontend in separate terminals
```

## Makefile Targets

| Target | Description |
|--------|-------------|
| `make dev-up` | Start Docker services (Postgres + LiveKit) |
| `make dev-down` | Stop Docker services |
| `make dev-backend` | Run Go API server |
| `make dev-frontend` | Run Electron app in dev mode |
| `make dev` | Start Docker services and print next steps |
| `make test` | Run all tests (backend + frontend) |
| `make test-backend` | Run Go tests with race detector + coverage |
| `make test-frontend` | Run Vitest |
| `make lint` | Run all linters |
| `make lint-backend` | Run `go vet` + `gosec` |
| `make lint-frontend` | Run ESLint + TypeScript type-check |
| `make build` | Build backend binary + frontend bundle |
| `make build-backend` | Build Go binary to `backend/bin/server` |
| `make build-frontend` | Build Electron app |
| `make migrate-up` | Run database migrations |
| `make migrate-down` | Roll back database migrations |
| `make seed` | Seed the database with test data |
| `make sec-scan` | Run gosec, govulncheck, and npm audit |

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `thicket` | Database user |
| `DB_PASSWORD` | `thicket_dev` | Database password |
| `DB_NAME` | `thicket` | Database name |
| `DB_SSL_MODE` | `disable` | PostgreSQL SSL mode |
| `JWT_SECRET` | `dev-secret-change-me` | HMAC-SHA256 signing key |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | `720h` | Refresh token lifetime (30 days) |
| `API_PORT` | `8080` | API server port |
| `API_HOST` | `0.0.0.0` | API server bind address |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `LIVEKIT_API_KEY` | `devkey` | LiveKit API key |
| `LIVEKIT_API_SECRET` | `secret` | LiveKit API secret |
| `LIVEKIT_URL` | `ws://localhost:7880` | LiveKit server URL |
| `ENV` | `development` | Environment name |

## Project Structure

```
discord_clone/
├── Makefile
├── docker-compose.yml          # Production
├── docker-compose.dev.yml      # Dev (Postgres + LiveKit)
├── Caddyfile                   # Reverse proxy config
├── .env.example
├── backend/
│   ├── cmd/server/main.go      # Entrypoint
│   └── internal/
│       ├── config/             # Env/config loading
│       ├── auth/               # JWT, bcrypt, middleware
│       ├── database/migrations/# SQL migration files
│       ├── handler/            # REST route handlers
│       ├── service/            # Business logic
│       ├── models/             # Domain types
│       ├── router/             # Route registration
│       ├── ws/                 # WebSocket hub, client, events
│       └── testutil/           # Test helpers (testcontainers)
├── frontend/
│   └── src/
│       ├── main/               # Electron main process
│       ├── preload/            # Context bridge (IPC)
│       └── renderer/           # React app
│           ├── components/     # layout, chat, voice, server, dm, auth, ui
│           ├── hooks/          # useWebSocket, useAuth, etc.
│           ├── stores/         # Zustand stores
│           ├── services/       # API client, WS service
│           ├── styles/         # Tailwind + cyberpunk theme
│           └── types/          # TypeScript type definitions
├── livekit/
│   └── livekit.yaml            # LiveKit server config
└── scripts/
    ├── dev.sh                  # Full dev environment startup
    ├── migrate.sh              # Migration helper
    └── seed.sh                 # Database seeding
```

## Testing

### Backend

```bash
make test-backend
# Runs: go test -race -cover ./...
```

Uses real PostgreSQL via testcontainers-go — no mocks for the database. Tests spin up ephemeral Postgres containers per suite.

### Frontend

```bash
make test-frontend
# Runs: vitest run
```

Uses Vitest with jsdom for Zustand store and component tests.

### All tests

```bash
make test
```

## Architecture

```
  Electron Client (React + Zustand)
    │           │              \
    │ HTTPS     │ WSS           \ WebRTC (UDP)
    │           │                \
  Go API Server                  LiveKit Server
  (Fiber v3)                     (self-hosted SFU)
  ├─ REST API                    └─ Voice/Video rooms
  ├─ WebSocket Hub
  ├─ JWT Auth
  └─ LiveKit token generation
    │
  PostgreSQL 16
```

- **REST** for CRUD operations, **WebSocket** for real-time events (messages, presence, typing)
- Go generates scoped LiveKit tokens; clients connect directly to LiveKit for media
- Single Go binary serves both REST and WebSocket on the same port

## Current Status — Phase 1 Complete

Phase 1 (Foundation) is complete with:

- JWT authentication (signup, login, refresh, logout) with bcrypt password hashing
- Auth middleware for protected routes
- WebSocket hub with subscribe/unsubscribe/broadcast
- Electron shell with React, routing, and cyberpunk base theme
- Zustand stores for auth and message state
- 22 passing Go tests (auth + WebSocket packages)
- 15 passing Vitest tests (authStore + messageStore)
- Docker Compose dev environment (PostgreSQL 16 + LiveKit)
- Makefile with dev, test, lint, build, and security scan targets
