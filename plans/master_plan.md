     Thicket — Cyberpunk Discord Clone Architecture Plan

     Context

     Building a lightweight, self-hosted Discord clone with a cyberpunk aesthetic as
     a desktop app. The goal is feature parity with Discord's core functionality
     (text chat, DMs, voice/video calls) while keeping monthly hosting costs under
     $15. Everything self-hosted on a single VPS with Docker Compose.

     ---
     Tech Stack
     ┌─────────────────────────────────────────┬──────────────────────────────────────────────┬───────────────────────────────────────────────────┐
     │                  Layer                  │                  Technology                  │                     Reasoning                     │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Desktop App                             │ Electron + React + TypeScript                │ Native desktop experience,                        │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ single codebase                         │                                              │                                                   │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Build Tool                              │ electron-vite                                │ Purpose-built for Electron+React, handles         │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ main/preload/renderer                   │                                              │                                                   │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Backend API                             │ Go + Fiber v3                                │ Fast, low memory, excellent                       │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ WebSocket/concurrency support           │                                              │                                                   │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Database                                │ PostgreSQL 16                                │ Battle-tested relational DB, self-hosted          │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ DB Access                               │ sqlc + pgx v5                                │ Type-safe generated Go from SQL, zero ORM         │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ overhead                                │                                              │                                                   │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Migrations                              │ golang-migrate                               │ Standard SQL migration tool for Go                │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Voice/Video                             │ LiveKit (self-hosted)                        │ Open-source WebRTC SFU, free when                 │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ self-hosted                             │                                              │                                                   │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ State Mgmt                              │ Zustand                                      │ Tiny, no boilerplate, great for many small stores │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Styling                                 │ Tailwind CSS                                 │ Utility-first, easily extended with cyberpunk     │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ theme                                   │                                              │                                                   │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Reverse Proxy                           │ Caddy                                        │ Auto-TLS via Let's Encrypt, simple config         │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Auth                                    │ JWT (access) + refresh tokens in DB          │ Stateless API calls,                              │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ revocable sessions                      │                                              │                                                   │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Go Testing                              │ stdlib testing + testify + testcontainers-go │ Real DB                                           │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ tests via ephemeral Postgres containers │                                              │                                                   │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Frontend Testing                        │ Vitest + React Testing Library + Playwright  │ Unit,                                             │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ component, and E2E testing              │                                              │                                                   │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ Security Scanning                       │ gosec + eslint-plugin-security + Trivy       │ Static                                            │
     ├─────────────────────────────────────────┼──────────────────────────────────────────────┼───────────────────────────────────────────────────┤
     │ analysis + container image scanning     │                                              │                                                   │
     └─────────────────────────────────────────┴──────────────────────────────────────────────┴───────────────────────────────────────────────────┘
     ---
     Estimated Monthly Cost: ~$7-8
     ┌────────────────────────────────────┬────────┐
     │                Item                │  Cost  │
     ├────────────────────────────────────┼────────┤
     │ Hetzner CX22 VPS (2 vCPU, 4GB RAM) │ ~$5.50 │
     ├────────────────────────────────────┼────────┤
     │ Domain name (amortized)            │ ~$1    │
     ├────────────────────────────────────┼────────┤
     │ TLS (Let's Encrypt via Caddy)      │ $0     │
     ├────────────────────────────────────┼────────┤
     │ LiveKit, PostgreSQL (self-hosted)  │ $0     │
     ├────────────────────────────────────┼────────┤
     │ Backups (optional snapshots)       │ ~$1    │
     └────────────────────────────────────┴────────┘
     ---
     Security Architecture

     Input Validation & Sanitization

     - All user input validated at the handler layer before reaching services/DB
     - Message content: Sanitize HTML to prevent stored XSS — use bluemonday
     (Go) to strip all tags, allow only plain text + markdown
     - Usernames/server names: Regex-validated (alphanumeric + limited special
     chars), length-capped
     - SQL injection: Prevented by design — sqlc generates parameterized queries,
      no string concatenation ever touches SQL
     - UUID parameters: Validated as proper UUIDs before DB queries (reject
     malformed IDs early)

     Authentication & Session Security

     - Password requirements: Minimum 8 chars, checked against breached password
     lists via haveibeenpwned API (k-anonymity model, no full password sent)
     - Brute force protection: Rate limit login attempts per IP — 5
     attempts/15min using Fiber's limiter middleware with in-memory store
     - JWT hardening: HMAC-SHA256 signing, explicit algorithm validation on parse
      (prevent alg:none attacks), short 15-min expiry
     - Refresh token rotation: Issue new refresh token on each refresh,
     invalidate the old one (prevents replay)
     - Session management: Limit to 5 active sessions per user, explicit session
     listing + revocation endpoint
     - CORS: Strict origin policy — only the Electron app origin (or null for
     file:// protocol), no wildcards
     - Cookie security: refresh token in httpOnly, Secure, SameSite=Strict cookie

     Transport Security

     - TLS everywhere: Caddy auto-provisions Let's Encrypt certs, enforces HTTPS
     - HSTS
     - WebSocket upgrade: Only over WSS, validated JWT required within 5 seconds
     of connection or auto-disconnect
     - LiveKit: Configured with TLS termination via Caddy, API key/secret never
     exposed to client

     Authorization

     - Resource-level checks in every handler: Before acting on a
     channel/server/message, verify the requesting user is a member with sufficient
     role
     - Message editing/deletion: Only the author can edit; author + admins +
     owner can delete
     - Server management: Only owner can delete server or transfer ownership;
     admins can manage channels/members
     - DM access: Only participants in a conversation can read/send messages
     - LiveKit tokens: Scoped per-room, short-lived (1 hour), user identity
     embedded

     Data Protection

     - Password hashing: bcrypt cost 12 (adaptive, stays slow on modern hardware)
     - Secrets management: All secrets (JWT_SECRET, DB_PASSWORD, LIVEKIT keys)
     via environment variables, never in code or Docker images
     - No sensitive data in JWTs: Only user ID + username in payload, no
     email/roles
     - Database: PostgreSQL connections scoped with least privilege (separate
     read/write users in production)
     - File uploads (future): If added, validate file type by magic bytes (not
     extension), size-limit, store outside webroot, serve via signed URLs

     Infrastructure Security

     - Docker: Run containers as non-root users, read-only filesystem where
     possible, no --privileged
     - Network isolation: Only Caddy exposed to internet (ports 80/443), all
     other services on internal Docker network
     - Dependency scanning: go mod tidy + govulncheck for Go, npm audit for
      frontend, Trivy for container images
     - Rate limiting: Applied at Caddy level (global) and Fiber middleware level
     (per-endpoint: stricter on auth, moderate on messaging)

     Electron-Specific Security

     - Context isolation: contextIsolation: true, nodeIntegration: false —
     renderer process cannot access Node.js APIs directly
     - Preload script: Expose only specific, typed IPC channels via
     contextBridge — no blanket access
     - No remote content loading: CSP headers restrict to self + API/LiveKit
     origins only
     - Auto-update: Signed updates via electron-updater if distributing
     publicly
     - Protocol handler: Register custom protocol (thicket://) for invite
     links, validate input strictly

     ---
     Testing Strategy (TDD)

     Philosophy

     - Write tests first for all backend service/handler logic and frontend
     store/hook logic
     - Red → Green → Refactor cycle: write failing test, minimal implementation,
     clean up
     - Test pyramid: Many unit tests, moderate integration tests, few E2E tests
     - No mocks for the database: Use testcontainers-go to spin up real
     PostgreSQL instances per test suite — catches real query bugs

     Backend Testing (backend/)

     Test structure mirrors source:
     backend/internal/
     ├── auth/
     │   ├── jwt.go
     │   ├── jwt_test.go          # Unit: token creation, validation, expiry,
     tampering
     │   ├── password.go
     │   ├── password_test.go      # Unit: hashing, verification, cost validation
     │   ├── middleware.go
     │   └── middleware_test.go    # Unit: valid token, expired, missing, malformed
     ├── handler/
     │   ├── auth_handler.go
     │   ├── auth_handler_test.go  # Integration: signup, login, refresh, logout via
     HTTP
     │   ├── server_handler.go
     │   ├── server_handler_test.go
     │   └── ...
     ├── service/
     │   ├── message_service.go
     │   ├── message_service_test.go  # Integration: CRUD with real DB
     │   └── ...
     └── ws/
         ├── hub.go
         ├── hub_test.go           # Unit: register, unregister, subscribe, broadcast
         ├── events.go
         └── events_test.go        # Unit: event serialization/deserialization

     Tools:
     - testing (stdlib) + github.com/stretchr/testify for assertions and test
     suites
     - github.com/testcontainers/testcontainers-go for ephemeral PostgreSQL
     containers
     - net/http/httptest for testing Fiber handlers (request/response cycle)
     - github.com/gorilla/websocket (client-side in tests) for WebSocket
     integration tests

     What to test (TDD order per feature):
     1. Auth tests first: JWT creation → JWT validation → JWT expiry → bcrypt
     hash → bcrypt verify → signup handler (dup email, weak password, success) →
     login handler (wrong password, success, returns tokens) → refresh handler →
     middleware (reject expired, reject missing, pass valid)
     2. Service layer: Test each service method against real Postgres (via
     testcontainers). E.g., CreateServer → verify row exists, JoinServer → verify
      membership, SendMessage → verify in DB with correct author/channel
     3. Handler layer: Integration tests using httptest — send real HTTP
     requests, assert status codes + JSON bodies + DB side effects
     4. WebSocket hub: Unit test the hub's register/unregister/broadcast logic
     using mock connections or Go channels. Integration test: connect two WS clients,
      send a message, verify both receive it

     Test helpers (in backend/internal/testutil/):
     - SetupTestDB() — spins up testcontainer Postgres, runs migrations, returns
     *pgx.Pool + cleanup func
     - CreateTestUser(pool) — inserts a user, returns user + JWT for authenticated
     test requests
     - CreateTestServer(pool, ownerID) — inserts server + default channel, returns
     server struct

     Frontend Testing (frontend/)

     Tools:
     - Vitest — fast, Vite-native test runner (replaces Jest), works with
     electron-vite
     - React Testing Library — component tests with user-centric queries
     - MSW (Mock Service Worker) — intercepts API calls in tests, no mock
     coupling
     - Playwright — E2E tests against running Electron app

     What to test:
     - Zustand stores: Unit tests for each store action — authStore.login()
     updates state correctly, messageStore.addMessage() appends to list,
     presenceStore.setStatus() updates user
     - Custom hooks: Test useWebSocket reconnection logic, useAuth token
     refresh, useLiveKit connection lifecycle
     - Components: Render tests — MessageList renders messages, LoginForm
     validates input and calls store, ServerIcon shows active indicator
     - API service: Test that api.ts correctly formats requests and handles
     error responses (using MSW)
     - E2E (Playwright): Login flow → create server → send message → verify
     displayed. Voice channel join → verify LiveKit connection

     Frontend test structure:
     frontend/src/renderer/
     ├── stores/
     │   ├── authStore.ts
     │   └── __tests__/
     │       └── authStore.test.ts
     ├── hooks/
     │   ├── useWebSocket.ts
     │   └── __tests__/
     │       └── useWebSocket.test.ts
     ├── components/
     │   ├── chat/
     │   │   ├── Message.tsx
     │   │   └── __tests__/
     │   │       └── Message.test.tsx
     │   └── auth/
     │       ├── LoginForm.tsx
     │       └── __tests__/
     │           └── LoginForm.test.tsx
     └── services/
         ├── api.ts
         └── __tests__/
             └── api.test.ts

     CI Pipeline (GitHub Actions or local pre-commit)

     # .github/workflows/ci.yml (or run locally via Makefile)
     jobs:
       backend-test:
         - go vet ./...
         - gosec ./...                    # Security static analysis
         - go test -race -cover ./...     # Tests with race detector + coverage
         - govulncheck ./...              # Known vulnerability check

       frontend-test:
         - npm run lint                   # ESLint + security plugin
         - npm run type-check             # tsc --noEmit
         - npm run test                   # Vitest
         - npm audit                      # Dependency vulnerability check

       container-scan:
         - docker build + trivy image scan  # CVE scanning on final images

     Coverage Targets

     - Backend service + handler: 80%+ line coverage
     - Frontend stores + hooks: 80%+
     - Frontend components: 60%+ (focus on logic-heavy components)
     - E2E: Cover critical paths — auth flow, message send/receive, voice join

     ---
     Project Structure

     discord_clone/
     ├── docker-compose.yml
     ├── docker-compose.dev.yml
     ├── Caddyfile
     ├── .env.example
     ├── Makefile
     ├── backend/
     │   ├── Dockerfile
     │   ├── go.mod / go.sum
     │   ├── sqlc.yaml
     │   ├── cmd/server/main.go
     │   └── internal/
     │       ├── config/          # Env/config loading
     │       ├── auth/            # JWT, bcrypt, middleware
     │       ├── database/
     │       │   ├── migrations/  # SQL migration files
     │       │   └── queries/     # sqlc SQL files
     │       ├── handler/         # REST route handlers
     │       ├── ws/              # WebSocket hub, client, events, presence
     │       ├── service/         # Business logic layer
     │       ├── models/          # sqlc-generated + domain types
     │       └── router/          # Route registration
     ├── frontend/
     │   ├── package.json
     │   ├── electron.vite.config.ts
     │   ├── src/
     │   │   ├── main/            # Electron main process
     │   │   ├── preload/         # Context bridge
     │   │   └── renderer/        # React app
     │   │       ├── components/  # layout/, chat/, voice/, server/, dm/, auth/, ui/
     │   │       ├── hooks/       # useWebSocket, useLiveKit, useAuth, usePresence
     │   │       ├── stores/      # Zustand: auth, server, channel, message,
     presence, voice
     │   │       ├── services/    # api.ts, ws.ts, livekit.ts
     │   │       ├── styles/      # globals.css, animations.css, tailwind.css
     │   │       └── types/       # api.ts, ws.ts, models.ts
     │   └── resources/           # App icons
     ├── livekit/
     │   └── livekit.yaml
     └── scripts/
         ├── dev.sh
         ├── migrate.sh
         └── seed.sh

     ---
     Services Architecture

       Electron Client (React)
         │         │           \
         │ HTTPS   │ WSS        \ WebRTC (UDP)
         │         │             \
       Go API Server              LiveKit Server
       (Fiber v3)                 (self-hosted SFU)
       - REST API                 - Voice/Video rooms
       - WebSocket Hub            - Media relay
       - JWT Auth
       - LiveKit token gen
         │
       PostgreSQL

     - REST for CRUD operations, WebSocket for real-time events
     - Go generates LiveKit tokens; clients connect directly to LiveKit for media
     - Single Go binary handles both REST + WebSocket on the same port

     ---
     Database Schema (key tables)

     - users — id, username, email, password_hash, avatar_url, status,
     display_name
     - servers — id, name, icon_url, owner_id, invite_code
     - server_members — server_id, user_id, role (owner/admin/member), nickname
     - channels — id, server_id, name, type (text/voice), position
     - messages — id, channel_id, author_id, content, created_at (indexed for
     pagination)
     - dm_conversations — id, is_group, name
     - dm_participants — conversation_id, user_id
     - dm_messages — id, conversation_id, author_id, content, created_at
     - sessions — id, user_id, refresh_token, expires_at (for token revocation)

     All IDs are UUIDs. Messages indexed on (channel_id, created_at DESC) for
     cursor-based pagination.

     ---
     Authentication

     - Access token: JWT, 15-min expiry, stored in memory only
     - Refresh token: 30-day expiry, stored in sessions table + httpOnly cookie
     - Password hashing: bcrypt cost 12
     - WebSocket auth: Client sends IDENTIFY with JWT after connection upgrade
     - Libraries: golang-jwt/jwt/v5, golang.org/x/crypto/bcrypt

     ---
     WebSocket Real-time Design

     Hub-and-spoke model in Go:
     - Hub goroutine manages: client registry, channel subscriptions, broadcast
     fan-out
     - Client struct: WS conn, user ID, send channel, subscribed channels
     - Each client spawns readPump + writePump goroutines

     Client → Server events: IDENTIFY, HEARTBEAT, SUBSCRIBE, UNSUBSCRIBE,
     TYPING_START, PRESENCE_UPDATE

     Server → Client events: READY, HEARTBEAT_ACK, MESSAGE_CREATE/UPDATE/DELETE,
     TYPING_START, PRESENCE_UPDATE, CHANNEL_CREATE/UPDATE/DELETE, MEMBER_JOIN/LEAVE,
     VOICE_STATE_UPDATE

     Message flow: POST /api → persist to DB → publish to WS hub → fan-out to
     subscribed clients

     Presence: Online on connect, heartbeat every 30s, offline after 45s timeout,
      idle from Electron powerMonitor

     ---
     Voice/Video (LiveKit)

     1. Client requests token from POST /api/livekit/token with room name + user
     identity
     2. Go generates JWT using livekit/protocol/auth with VideoGrant
     3. Client connects to LiveKit directly using livekit-client SDK
     4. Media flows peer-to-LiveKit via WebRTC (UDP preferred)
     5. Go notifies other clients via VOICE_STATE_UPDATE WebSocket events

     Room naming: server:{id}:voice:{channel_id} for channels,
     dm:{conversation_id} for calls

     ---
     Cyberpunk UI Theme

     Color palette: Near-black backgrounds (#0a0a0f, #12121a, #1a1a2e) with neon
     accents:
     - Cyan (#00f0ff) — primary accent, active states
     - Magenta (#ff00aa) — notifications, mentions
     - Green (#00ff88) — online status
     - Red (#ff0040) — errors, disconnect
     - Purple (#b000ff) — voice active

     Fonts: Orbitron (headings), Inter (body), Share Tech Mono (timestamps/code)

     Effects: Neon glow borders (box-shadow), glitch text animation (clip-path),
     scanline overlay, neon pulse on voice-active indicators

     Electron: Frameless window with custom title bar, draggable region, neon
     accent line

     Tailwind: Extended theme with cyber-bg, neon-* colors, glow-* shadows,
      custom font families

     Performance: @tanstack/react-virtual for message list virtualization

     ---
     Development Phases (TDD Throughout)

     Each phase follows: write tests → implement → verify → refactor

     Phase 1: Foundation (Week 1-2)

     - Monorepo setup, Docker Compose (dev), Makefile with test, lint, sec-scan
      targets
     - Go module init with Fiber, pgx, testify, testcontainers-go
     - SetupTestDB() test helper — spin up Postgres container, run migrations,
     return pool
     - TDD auth: Write tests first for JWT create/validate/expiry, bcrypt
     hash/verify, signup handler (dup email, weak password, success), login handler
     (wrong pass, success), refresh, middleware (reject expired/missing/malformed)
     - Electron app with electron-vite + React + Vitest + React Testing Library
     - TDD frontend auth store: test login/logout/refresh actions update state
     correctly
     - Login/signup screens with input validation tests, basic cyberpunk styling
     - Set up gosec, eslint-plugin-security, pre-commit hooks

     Phase 2: Servers & Channels (Week 3-4)

     - TDD service layer: CreateServer (creates server + default general
     channel), JoinServer (prevents double-join), LeaveServer (owner can't
     leave), CreateChannel (admin+ only)
     - TDD handler layer: HTTP integration tests for all server/channel
     endpoints, including authorization checks (non-member can't access, non-admin
     can't create channels)
     - Frontend: server list sidebar, channel list, navigation — component tests for
     rendering + interaction
     - TDD Zustand stores: serverStore and channelStore actions

     Phase 3: Real-time Text Chat (Week 5-6)

     - TDD WebSocket hub: Unit test register/unregister/subscribe/broadcast using
      Go channels (no real WS needed)
     - TDD WS integration: Connect two gorilla/websocket clients to test server,
     send message from one, assert other receives it
     - TDD message service: CreateMessage (validates author is channel member),
     GetMessages (cursor pagination, correct ordering)
     - TDD message handler: POST returns 403 for non-members, 201 for members,
     message appears in GET
     - Frontend: useWebSocket hook tests (connection, reconnection, event dispatch),
     MessageList component tests, MessageInput validation tests
     - Security: Sanitize message content with bluemonday before storage, test
     that HTML/script tags are stripped

     Phase 4: Direct Messages (Week 7)

     - TDD DM service: CreateConversation (dedup 1:1), SendDM (only
     participants), GetConversations (only user's own)
     - TDD authorization: Verify non-participants get 403 on all DM endpoints
     - Frontend: DM store tests, DM component rendering tests

     Phase 5: Presence (Week 8)

     - TDD presence: Heartbeat timeout triggers offline, reconnect triggers
     online, PRESENCE_UPDATE broadcast to relevant users only (not strangers)
     - TDD idle detection: Mock Electron powerMonitor, verify idle status sent
     after threshold
     - Frontend: presence store tests, status indicator component tests

     Phase 6: Voice & Video (Week 9-10)

     - LiveKit in Docker Compose
     - TDD token endpoint: Verify token contains correct room + identity +
     grants, verify non-members can't get token for a channel they're not in
     - TDD voice state: Join/leave broadcasts VOICE_STATE_UPDATE to correct
     subscribers
     - Frontend: useLiveKit hook tests (connect/disconnect/mute state), VoiceControls
      component tests
     - Security: LiveKit tokens scoped to specific room, 1-hour expiry, identity
     validated against JWT

     Phase 7: Polish (Week 11-12)

     - Full cyberpunk theme pass, glitch/neon effects, sounds, frameless window,
     system tray, notifications
     - Performance optimization (virtualized message list)
     - E2E tests with Playwright: Login → create server → send message → verify
     received, voice channel join flow
     - Error handling + loading state tests

     Phase 8: Deploy & Harden (Week 13)

     - Production Docker Compose + Caddy (TLS, HSTS, security headers)
     - Hetzner VPS deploy
     - Rate limiting on all endpoints (stricter on auth)
     - Container scanning with Trivy, govulncheck, npm audit
     - Automated backup script (pg_dump cron)
     - Security audit: Run full gosec scan, review OWASP top 10 checklist against
      implementation
     - Docker hardening: non-root users, read-only filesystem, drop all capabilities

     ---
     Verification Plan

     Automated (run on every change)

     - make test — runs Go tests with race detector + coverage report, Vitest for
     frontend
     - make lint — go vet, gosec, eslint (with security plugin), tsc type-check
     - make sec-scan — govulncheck, npm audit, trivy (on built images)
     - Pre-commit hook runs make lint test before allowing commits

     Manual Verification Per Phase

     - Phase 1: Sign up in Electron → receive JWT → make authenticated API call →
      verify in Postgres. Try weak passwords, duplicate emails — verify rejection.
     Try expired/tampered JWT — verify 401.
     - Phase 2: Create server → generate invite → join from second account → see
     member list. Try accessing server as non-member — verify 403. Try creating
     channel as member (not admin) — verify 403.
     - Phase 3: Open channel → send message → see it appear in real-time on
     another client → scroll up for history. Try sending
     <script>alert('xss')</script> — verify it renders as plain text. Disconnect
     network → reconnect → verify WS reconnects.
     - Phase 4: Create DM → send message → verify real-time delivery. Try
     accessing another user's DM — verify 403.
     - Phase 5: Connect/disconnect → verify presence updates across clients.
     Close app abruptly → verify status goes offline after heartbeat timeout.
     - Phase 6: Click voice channel → verify audio flows → test video toggle →
     test group call. Try getting LiveKit token for a channel you're not in — verify
     - Phase 7: Run Playwright E2E suite against running app — full flow
     coverage.
     - Phase 8: Deploy to VPS. Verify Caddy TLS (SSL Labs test). Run nmap port
     scan — only 80/443 exposed. Verify rate limiting by hammering login endpoint.
     Run Trivy on production images.

     "/plan open" to edit this plan in VS Code
