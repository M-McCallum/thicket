# Thicket

A self-hosted Discord clone with a solarpunk aesthetic. Available as an Electron desktop app and a standalone web client.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop App | Electron + React 19 + TypeScript |
| Web Client | React 19 + Vite + TypeScript |
| Build Tool | electron-vite 5 (desktop), Vite 5 (web) |
| Styling | Tailwind CSS |
| State Management | Zustand 5 |
| Backend API | Go 1.25 + Fiber v3 |
| Database | PostgreSQL 16 + pgx v5 |
| Real-time | WebSocket (fasthttp/websocket) |
| Voice/Video | LiveKit (self-hosted) |
| Auth | Ory Kratos + Hydra (OAuth2 PKCE) |

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

### Web Client

The web client is a standalone browser-based frontend that shares the same components, stores, and services as the Electron app. It replaces the Electron-specific pieces (custom protocol OAuth, safeStorage, window chrome) with browser equivalents (redirect-based OAuth, localStorage, standard Vite SPA).

```bash
# 1. Start dev services (Postgres, Kratos, Hydra, LiveKit)
make dev-up

# 2. Start the Go API server
make dev-backend

# 3. Install web dependencies and start dev server
cd web && npm install
make dev-web
```

Open `http://localhost:5173` in your browser. The web client uses Vite's dev server with HMR.

#### Environment Configuration

Copy `web/.env.example` to `web/.env` to customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8080/api` | Backend API base URL |
| `VITE_WS_URL` | `ws://localhost:8080/ws` | WebSocket endpoint |
| `VITE_OIDC_AUTHORITY` | `http://localhost:4444` | Ory Hydra public URL |
| `VITE_OIDC_CLIENT_ID` | `thicket-web` | OAuth2 client ID |
| `VITE_OIDC_REDIRECT_URI` | `http://localhost:5173/auth/callback` | OAuth2 redirect URI |

#### How It Differs from the Electron Client

| Concern | Electron (`frontend/`) | Web (`web/`) |
|---------|----------------------|-------------|
| OAuth flow | Custom `thicket://` protocol + `OidcClient` | Browser redirect + `UserManager` |
| Token storage | OS keychain via `safeStorage` | `localStorage` |
| Window chrome | Custom frameless titlebar | Removed (uses browser chrome) |
| Entry point | `electron-vite` multi-process | Standard Vite SPA |
| Build output | Electron distributable | Static files (served by Caddy) |

Components, stores, services, types, and Tailwind theme are identical between both clients.

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
| `make dev-web` | Run web client dev server on :5173 |
| `make dev` | Start Docker services and print next steps |
| `make test` | Run all tests (backend + frontend + web) |
| `make test-backend` | Run Go tests with race detector + coverage |
| `make test-frontend` | Run Vitest (Electron frontend) |
| `make test-web` | Run Vitest (web client) |
| `make lint` | Run all linters |
| `make lint-backend` | Run `go vet` + `gosec` |
| `make lint-frontend` | Run ESLint + TypeScript type-check |
| `make build` | Build backend binary + frontend + web bundles |
| `make build-backend` | Build Go binary to `backend/bin/server` |
| `make build-frontend` | Build Electron app |
| `make build-web` | Build web client to `web/dist/` |
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
├── frontend/                      # Electron desktop client
│   └── src/
│       ├── main/               # Electron main process
│       ├── preload/            # Context bridge (IPC)
│       └── renderer/           # React app
│           ├── components/     # layout, chat, server, dm, auth
│           ├── stores/         # Zustand stores
│           ├── services/       # API client, WS service, OAuth
│           ├── styles/         # Tailwind + solarpunk theme
│           └── types/          # TypeScript type definitions
├── web/                           # Standalone web client
│   ├── Dockerfile              # Multi-stage build (Node + Caddy)
│   └── src/
│       ├── components/         # Same components (no TitleBar)
│       ├── stores/             # Same Zustand stores
│       ├── services/           # Adapted: localStorage, browser OAuth
│       ├── styles/             # Same Tailwind theme
│       └── types/              # Same type definitions
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

### Frontend (Electron)

```bash
make test-frontend
# Runs: vitest run
```

Uses Vitest with jsdom for Zustand store and component tests.

### Web Client

```bash
make test-web
# Runs: vitest run
```

Same test setup as the Electron frontend (135 tests across 15 test files), adapted to mock `localStorage` instead of `window.api`.

### All tests

```bash
make test
```

## Architecture

```
  Electron Client          Web Client
  (React + Zustand)        (React + Zustand)
    │           │              │           │
    │ HTTPS     │ WSS          │ HTTPS     │ WSS
    │           │              │           │
    └───────────┴──────┬───────┘           │
                       │                   │
                 Go API Server          LiveKit Server
                 (Fiber v3)             (self-hosted SFU)
                 ├─ REST API            └─ Voice/Video rooms
                 ├─ WebSocket Hub
                 ├─ Ory Hydra/Kratos Auth
                 └─ LiveKit token generation
                   │
                 PostgreSQL 16
```

In production, Caddy serves the web client's static files and reverse-proxies `/api/*`, `/ws`, and `/livekit/*` to the backend and LiveKit services.

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
