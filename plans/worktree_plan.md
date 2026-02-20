# Worktree Plan: Auth Migration (Ory Kratos + Hydra)

## Overview
- **Total workstreams**: 5 (1 foundation + 3 parallel + 1 integration)
- **Phases**: 3 (foundation → parallel → integration)
- **Total atomic commits**: 17 across all worktrees
- **Estimated parallel speedup**: ~1.4x on critical path (3 concurrent sessions during parallel phase)

## File Ownership Map
> Shows which worktree owns which files/directories to prevent conflicts.
> Foundation completes before parallel streams begin; parallel streams have zero file overlap.

| Worktree | Owned Files/Directories |
|----------|------------------------|
| foundation | `backend/internal/auth/{jwks.go, jwks_test.go, middleware.go}`, `backend/internal/config/config.go`, `backend/internal/models/{models.go, users.go, db.go}`, `backend/internal/database/{queries/users.sql, migrations/000002_*}`, `backend/internal/testutil/testjwks.go`, `backend/internal/router/router.go`, `backend/cmd/server/main.go`, `backend/sqlc.yaml` |
| stream-backend-ory | `backend/internal/ory/*`, `backend/internal/handler/ory_handler.go`, `backend/internal/service/identity_service.go`, `backend/internal/router/router.go`, `backend/cmd/server/main.go`, `backend/internal/ws/{events.go, handler.go, client.go}` |
| stream-frontend-oauth | `frontend/**` (all frontend files) |
| stream-migration-cli | `backend/cmd/migrate-identities/main.go` |
| integration | All files (runs after all streams merge) |

## Phase 0: Foundation

> Must complete before Phase 1 begins. Implements original plan Phase 1: JWKS + RS256 dual auth + kratos_id column.

### Worktree: `foundation`
- **Branch**: `feat/jwks-foundation`
- **Purpose**: Add RS256 JWKS token validation alongside existing HS256, add kratos_id to users table. This is the prerequisite for all Ory integration work.
- **Commit sequence**:

| # | Commit message | Files | Verify |
|---|---------------|-------|--------|
| 1 | `feat(db): add kratos_id column and user queries for Ory integration` | `backend/internal/database/migrations/000002_add_kratos_id.{up,down}.sql`, `backend/internal/database/queries/users.sql`, `backend/internal/models/{models.go, users.go, db.go}` | `sqlc generate` succeeds, `go build ./...` passes |
| 2 | `feat(auth): implement JWKS manager and test helpers for RS256 validation` | `backend/internal/auth/jwks.go`, `backend/internal/auth/jwks_test.go`, `backend/internal/testutil/testjwks.go` | `go test ./internal/auth/...` passes |
| 3 | `feat(auth): add dual HS256/RS256 authentication middleware` | `backend/internal/auth/middleware.go` | `go test ./internal/auth/...` passes, existing tests still pass |
| 4 | `feat: add Ory config and wire JWKS dual auth into router` | `backend/internal/config/config.go`, `backend/internal/router/router.go`, `backend/cmd/server/main.go` | `go build ./...` passes, `go test ./...` all pass |

- **Done when**: All 4 commits made, all existing tests pass with HS256, new JWKS tests pass with RS256, `go test ./...` green.
- **Claude Code prompt**:

> You are working on the Thicket Discord clone in a git worktree dedicated to JWKS + RS256 foundation work.
>
> ## Context
> Thicket is a Discord clone with a Go/Fiber backend and Electron frontend. It currently uses HS256 JWT authentication. We're migrating to Ory Kratos + Hydra for OAuth2 with RS256 tokens. This worktree lays the foundation that all other auth migration streams depend on.
>
> ## Your Goal
> 1. Add a `kratos_id` UUID column to the users table (nullable, unique) with sqlc queries
> 2. Create a JWKSManager that fetches public keys from a JWKS endpoint and validates RS256 tokens
> 3. Create a DualMiddleware that tries RS256 first, then falls back to HS256 (for migration period)
> 4. Add Ory service URLs to config and wire everything into the router and main.go
>
> ## Key Architecture
> - Backend: Go + Fiber v3, PostgreSQL with pgx/v5, sqlc for query generation
> - sqlc config: `backend/sqlc.yaml` — queries in `internal/database/queries/`, schema in `internal/database/migrations/`, output to `internal/models/`
> - Current auth: `internal/auth/jwt.go` (HS256 JWTManager), `internal/auth/middleware.go` (Middleware func)
> - Router config: `internal/router/router.go` has a `Config` struct, auth middleware applied to `/api/*` group
> - Main entry: `cmd/server/main.go` constructs all services and passes Config to router
>
> ## Commit Discipline — IMPORTANT
> You MUST make one atomic commit per task below. Follow these rules strictly:
> - Complete each task fully before committing (code + tests for that task)
> - Verify the build passes and relevant tests pass BEFORE each commit
> - Use the exact commit messages provided below
> - NEVER combine multiple tasks into one commit
> - NEVER leave a commit in a broken state
> - If a task turns out to need sub-steps, that's fine — but squash them into the single specified commit
>
> After each commit, run the verification step listed. If it fails, fix it within the same commit (amend).
>
> ## Commit Sequence
>
> ### Commit 1: `feat(db): add kratos_id column and user queries for Ory integration`
> - Create `backend/internal/database/migrations/000002_add_kratos_id.up.sql`:
>   ```sql
>   ALTER TABLE users ADD COLUMN kratos_id UUID UNIQUE;
>   ```
> - Create `backend/internal/database/migrations/000002_add_kratos_id.down.sql`:
>   ```sql
>   ALTER TABLE users DROP COLUMN IF EXISTS kratos_id;
>   ```
> - Update `backend/internal/database/queries/users.sql` — add these queries:
>   ```sql
>   -- name: GetUserByKratosID :one
>   SELECT * FROM users WHERE kratos_id = $1;
>
>   -- name: SetUserKratosID :exec
>   UPDATE users SET kratos_id = $2, updated_at = NOW() WHERE id = $1;
>
>   -- name: CreateUserFromKratos :one
>   INSERT INTO users (username, email, password_hash, kratos_id)
>   VALUES ($1, $2, '', $3)
>   RETURNING *;
>   ```
> - Run `cd backend && sqlc generate` to regenerate Go models
> - The generated `models.go` should now include `KratosID` field on User
> - Verify: `cd backend && go build ./...` passes
>
> ### Commit 2: `feat(auth): implement JWKS manager and test helpers for RS256 validation`
> - Create `backend/internal/auth/jwks.go`:
>   - `JWKSManager` struct with `jwksURL string`, cached keyset, sync mutex, refresh interval
>   - `NewJWKSManager(jwksURL string) *JWKSManager`
>   - `ValidateToken(tokenString string) (*Claims, error)` — fetches JWKS keys (with caching), parses RS256 JWT, returns same Claims struct used by HS256
>   - Use `github.com/golang-jwt/jwt/v5` for parsing (already a dependency)
>   - Fetch JWKS JSON from the URL, parse "keys" array, build `*rsa.PublicKey` from JWK "n" and "e" fields
>   - Cache keys with a TTL (e.g., 5 minutes), refresh on cache miss for unknown kid
> - Create `backend/internal/auth/jwks_test.go`:
>   - Test with httptest server serving a JWKS endpoint
>   - Test valid RS256 token validation
>   - Test expired token rejection
>   - Test invalid signature rejection
> - Create `backend/internal/testutil/testjwks.go`:
>   - `TestJWKSServer` struct: generates RSA keypair, serves JWKS via httptest
>   - `NewTestJWKSServer() *TestJWKSServer`
>   - `CreateToken(userID uuid.UUID, username string) string` — creates signed RS256 token
>   - `Close()` — shuts down httptest server
> - Verify: `cd backend && go test ./internal/auth/... ./internal/testutil/...`
>
> ### Commit 3: `feat(auth): add dual HS256/RS256 authentication middleware`
> - Modify `backend/internal/auth/middleware.go`:
>   - Keep existing `Middleware(jwtManager *JWTManager) fiber.Handler` unchanged
>   - Add `DualMiddleware(jwtManager *JWTManager, jwksManager *JWKSManager) fiber.Handler`:
>     - Extract Bearer token from Authorization header
>     - Try `jwksManager.ValidateToken()` first (RS256)
>     - If that fails, try `jwtManager.ValidateToken()` (HS256 fallback)
>     - If both fail, return 401
>     - On success, set userID and username in context (same as current Middleware)
>   - Keep `GetUserID()` and `GetUsername()` helpers unchanged
> - Verify: `cd backend && go test ./internal/auth/...` — all existing + new tests pass
>
> ### Commit 4: `feat: add Ory config and wire JWKS dual auth into router`
> - Modify `backend/internal/config/config.go`:
>   - Add `OryConfig` struct:
>     ```go
>     type OryConfig struct {
>         KratosPublicURL string
>         KratosAdminURL  string
>         HydraPublicURL  string
>         HydraAdminURL   string
>     }
>     ```
>   - Add `Ory OryConfig` field to `Config` struct
>   - Load from env vars: `KRATOS_PUBLIC_URL` (default "http://localhost:4433"), `KRATOS_ADMIN_URL` (default "http://localhost:4434"), `HYDRA_PUBLIC_URL` (default "http://localhost:4444"), `HYDRA_ADMIN_URL` (default "http://localhost:4445")
>   - Derive JWKS URL: `HydraPublicURL + "/.well-known/jwks.json"`
> - Modify `backend/internal/router/router.go`:
>   - Add `JWKSManager *auth.JWKSManager` to `Config` struct
>   - Change the protected group middleware from `auth.Middleware(cfg.JWTManager)` to `auth.DualMiddleware(cfg.JWTManager, cfg.JWKSManager)`
> - Modify `backend/cmd/server/main.go`:
>   - Construct `JWKSManager` from config JWKS URL
>   - Pass it to router Config
> - Verify: `cd backend && go build ./...` passes, `go test ./...` all pass
>
> ## Boundaries
> - ONLY modify files in: `backend/internal/auth/`, `backend/internal/config/`, `backend/internal/models/`, `backend/internal/database/`, `backend/internal/testutil/`, `backend/internal/router/`, `backend/cmd/server/`, `backend/sqlc.yaml`
> - Do NOT touch: `backend/internal/ws/`, `backend/internal/handler/`, `backend/internal/service/`, `frontend/`, `ory/`
>
> ## Done When
> - [ ] All 4 commits made in order
> - [ ] Each commit passes its verification step
> - [ ] `go test ./...` passes (all existing tests still work)
> - [ ] `git log --oneline` shows clean, atomic history

---

## Phase 1: Parallel Workstreams

> All streams in this phase can run simultaneously after merging the foundation branch.

### Worktree: `stream-backend-ory`
- **Branch**: `feat/ory-backend`
- **Purpose**: Implement Hydra login/consent/logout provider endpoints (plan Phase 2) and WebSocket RS256 + token refresh support (plan Phase 4). These are grouped because both modify `router.go` and `main.go`.
- **Depends on**: Phase 0 (foundation) — needs JWKSManager, kratos_id column, DualMiddleware
- **Commit sequence**:

| # | Commit message | Files | Verify |
|---|---------------|-------|--------|
| 1 | `feat(ory): add Kratos/Hydra API types and HTTP clients` | `backend/internal/ory/{types.go, client.go, client_test.go}` | `go test ./internal/ory/...` passes |
| 2 | `feat(service): implement identity service for Kratos user sync` | `backend/internal/service/identity_service.go` | `go build ./...` passes |
| 3 | `feat(auth): add Hydra login/consent/logout provider endpoints` | `backend/internal/handler/ory_handler.go`, `backend/internal/router/router.go`, `backend/cmd/server/main.go` | `go build ./...` passes |
| 4 | `feat(ws): add dual token validation and mid-connection token refresh` | `backend/internal/ws/{events.go, handler.go, client.go}`, `backend/internal/router/router.go` | `go test ./...` all pass |

- **Done when**: Full OAuth2 flow testable (Hydra → login → consent → callback → token), WS accepts RS256 tokens and handles TOKEN_REFRESH/SESSION_EXPIRED events, all tests pass.
- **Interface contract**: WebSocket events `TOKEN_REFRESH` and `SESSION_EXPIRED` (close code 4001) must match frontend ws.ts implementation in stream-frontend-oauth.
- **Claude Code prompt**:

> You are working on the Thicket Discord clone in a git worktree dedicated to backend Ory integration and WebSocket auth migration.
>
> ## Context
> Thicket is a Discord clone with a Go/Fiber backend. The foundation branch (`feat/jwks-foundation`) has already been merged, providing: JWKSManager for RS256 validation, DualMiddleware (RS256 + HS256 fallback), kratos_id column on users, OryConfig with Kratos/Hydra URLs. Your job is to build the Ory API integration and update WebSocket auth.
>
> ## Your Goal
> 1. Create HTTP clients for Kratos Admin and Hydra Admin APIs
> 2. Create an identity service that syncs Kratos identities to local users
> 3. Implement Hydra login/consent/logout provider endpoints
> 4. Update WebSocket handler to support RS256 tokens and mid-connection token refresh
>
> ## Key Architecture
> - Hydra redirects to our app at `/auth/login`, `/auth/consent`, `/auth/logout` with challenge parameters
> - Our endpoints accept the challenge, interact with Kratos (for identity) and Hydra Admin (to accept/reject), then redirect back
> - Auto-accept consent for first-party clients (metadata.is_first_party = true)
> - WebSocket IDENTIFY already validates JWT via JWTManager — add dual RS256/HS256 validation
> - New WS events: TOKEN_REFRESH (client→server, {token: string}), SESSION_EXPIRED (server→client, close code 4001)
> - Existing Router Config struct has: JWTManager, JWKSManager, Hub, and all handlers
> - OryConfig available via config: KratosPublicURL, KratosAdminURL, HydraPublicURL, HydraAdminURL
>
> ## Commit Discipline — IMPORTANT
> You MUST make one atomic commit per task below. Follow these rules strictly:
> - Complete each task fully before committing (code + tests for that task)
> - Verify the build passes and relevant tests pass BEFORE each commit
> - Use the exact commit messages provided below
> - NEVER combine multiple tasks into one commit
> - NEVER leave a commit in a broken state
>
> ## Commit Sequence
>
> ### Commit 1: `feat(ory): add Kratos/Hydra API types and HTTP clients`
> - Create `backend/internal/ory/types.go` — request/response types matching Hydra/Kratos Admin API JSON:
>   - Hydra: LoginRequest, AcceptLoginRequest, ConsentRequest, AcceptConsentRequest, TokenIntrospection, etc.
>   - Kratos: Identity (with traits: username, email, display_name)
> - Create `backend/internal/ory/client.go` — plain net/http clients (no SDK):
>   - `KratosClient` struct with adminURL: `GetIdentity(ctx, id string) (*Identity, error)`
>   - `HydraClient` struct with adminURL:
>     - `GetLoginRequest(ctx, challenge string) (*LoginRequest, error)`
>     - `AcceptLogin(ctx, challenge string, body AcceptLoginRequest) (*CompletedRequest, error)`
>     - `GetConsentRequest(ctx, challenge string) (*ConsentRequest, error)`
>     - `AcceptConsent(ctx, challenge string, body AcceptConsentRequest) (*CompletedRequest, error)`
>     - `RevokeConsentSessions(ctx, subject string) error`
>     - `RevokeRefreshTokens(ctx, clientID string) error`
> - Create `backend/internal/ory/client_test.go` — tests using httptest mock servers
> - Verify: `cd backend && go test ./internal/ory/...`
>
> ### Commit 2: `feat(service): implement identity service for Kratos user sync`
> - Create `backend/internal/service/identity_service.go`:
>   - `IdentityService` struct with `queries *models.Queries`, `kratosClient *ory.KratosClient`
>   - `FindOrCreateUser(ctx, kratosID string) (*models.User, error)`:
>     - Try `queries.GetUserByKratosID(ctx, kratosID)`
>     - If not found: fetch identity from Kratos Admin API, extract traits, call `queries.CreateUserFromKratos(ctx, username, email, kratosID)`
>   - `SyncTraits(ctx, kratosID string) error`:
>     - Fetch identity from Kratos, update local user's username/email if changed
> - Verify: `cd backend && go build ./...`
>
> ### Commit 3: `feat(auth): add Hydra login/consent/logout provider endpoints`
> - Create `backend/internal/handler/ory_handler.go`:
>   - `OryHandler` struct with `hydraClient`, `identityService`, `kratosPublicURL`
>   - `GetLogin(c fiber.Ctx) error` — GET /auth/login:
>     - Extract `login_challenge` query param
>     - Call hydraClient.GetLoginRequest — if skip=true, auto-accept with existing subject
>     - Otherwise redirect to Kratos self-service login flow (kratosPublicURL + `/self-service/login/browser`)
>   - `PostLogin(c fiber.Ctx) error` — POST /auth/login:
>     - After Kratos authenticates, accept Hydra login challenge with Kratos identity UUID as subject
>     - Call identityService.FindOrCreateUser + SyncTraits
>     - Redirect to Hydra redirect URL
>   - `GetConsent(c fiber.Ctx) error` — GET /auth/consent:
>     - Extract `consent_challenge`, get consent request from Hydra
>     - Auto-accept for first-party clients: grant requested scopes, include subject in access token
>   - `GetLogout(c fiber.Ctx) error` — GET /auth/logout:
>     - Revoke Hydra tokens, redirect to login
> - Modify `backend/internal/router/router.go`:
>   - Add `OryHandler *handler.OryHandler` to Config
>   - Add `/auth/*` route group (no auth middleware):
>     - GET /auth/login → OryHandler.GetLogin
>     - POST /auth/login → OryHandler.PostLogin
>     - GET /auth/consent → OryHandler.GetConsent
>     - GET /auth/logout → OryHandler.GetLogout
> - Modify `backend/cmd/server/main.go`:
>   - Construct KratosClient, HydraClient, IdentityService, OryHandler
>   - Pass OryHandler to router Config
> - Verify: `cd backend && go build ./...`
>
> ### Commit 4: `feat(ws): add dual token validation and mid-connection token refresh`
> - Modify `backend/internal/ws/events.go`:
>   - Add `EventTokenRefresh = "TOKEN_REFRESH"` (client → server)
>   - Add `EventSessionExpired = "SESSION_EXPIRED"` (server → client)
>   - Add `TokenRefreshData struct { Token string }`
> - Modify `backend/internal/ws/handler.go`:
>   - Update `Handler()` signature to accept `jwksManager *auth.JWKSManager` and `queries *models.Queries`
>   - During IDENTIFY: try jwksManager.ValidateToken first (RS256), fall back to jwtManager.ValidateToken (HS256)
> - Modify `backend/internal/ws/client.go`:
>   - Handle TOKEN_REFRESH in `handleEvent`:
>     - Validate new token (dual RS256/HS256)
>     - If valid and same user: update client credentials
>     - If invalid: send SESSION_EXPIRED event, close with code 4001
> - Modify `backend/internal/router/router.go`:
>   - Pass jwksManager and queries to WS Handler call
> - Verify: `cd backend && go test ./...` all pass
>
> ## Boundaries
> - ONLY modify files in: `backend/internal/ory/`, `backend/internal/handler/ory_handler.go`, `backend/internal/service/identity_service.go`, `backend/internal/router/router.go`, `backend/cmd/server/main.go`, `backend/internal/ws/`
> - Do NOT touch: `frontend/`, `backend/internal/auth/` (owned by foundation), `backend/internal/models/` (owned by foundation), `backend/internal/config/` (owned by foundation), `backend/cmd/migrate-identities/`
>
> ## Done When
> - [ ] All 4 commits made in order
> - [ ] Each commit passes its verification step
> - [ ] `go test ./...` passes
> - [ ] `git log --oneline` shows clean, atomic history

---

### Worktree: `stream-frontend-oauth`
- **Branch**: `feat/oauth-frontend`
- **Purpose**: Migrate Electron client from direct login to OAuth2 PKCE flow with safeStorage (plan Phase 3) and add WebSocket token refresh handling (plan Phase 4 frontend).
- **Depends on**: Phase 0 (foundation) — needs backend to accept RS256 tokens. Does NOT need stream-backend-ory to be complete for code-level work (interface contracts defined below).
- **Commit sequence**:

| # | Commit message | Files | Verify |
|---|---------------|-------|--------|
| 1 | `chore(deps): add oidc-client-ts and electron-store` | `frontend/package.json` | `npm install` succeeds |
| 2 | `feat(electron): add thicket:// protocol and safeStorage IPC handlers` | `frontend/src/main/index.ts`, `frontend/src/preload/index.ts`, `frontend/src/preload/index.d.ts` | `npm run type-check` passes |
| 3 | `feat(oauth): implement OAuth2 PKCE service and update auth types` | `frontend/src/renderer/services/oauth.ts`, `frontend/src/renderer/types/api.ts` | `npm run type-check` passes |
| 4 | `feat(auth): rewrite auth store and API service for OAuth2 safeStorage` | `frontend/src/renderer/stores/authStore.ts`, `frontend/src/renderer/services/api.ts` | `npm run type-check` passes |
| 5 | `feat(ui): add OAuth2 login, callback handling, and WS token refresh` | `frontend/src/renderer/components/auth/LoginForm.tsx`, `frontend/src/renderer/App.tsx`, `frontend/src/renderer/services/ws.ts`, `frontend/src/renderer/types/ws.ts` | `npm run type-check` passes, `npm test` passes |

- **Done when**: "Sign in with Thicket" button triggers PKCE flow in system browser, callback via thicket:// protocol stores tokens in safeStorage, token refresh works, WS sends TOKEN_REFRESH on access token refresh, handles SESSION_EXPIRED/4001.
- **Interface contracts**:
  - Hydra issuer URL: `http://localhost:4444` (from docker-compose)
  - OAuth2 client_id: `thicket-desktop` (from register-clients.sh)
  - Scopes: `openid offline_access profile`
  - Redirect URI: `thicket://auth/callback`
  - WebSocket events: `TOKEN_REFRESH` (send `{token: string}`), `SESSION_EXPIRED` (receive), close code `4001`
- **Claude Code prompt**:

> You are working on the Thicket Discord clone in a git worktree dedicated to frontend OAuth2 migration.
>
> ## Context
> Thicket is an Electron + React Discord clone. It currently uses direct email/password login with HS256 JWT tokens stored in localStorage. We're migrating to OAuth2 PKCE via Ory Hydra with tokens encrypted in OS-level safeStorage. This worktree handles ALL frontend changes.
>
> ## Your Goal
> 1. Add oidc-client-ts and electron-store dependencies
> 2. Register thicket:// custom protocol and safeStorage IPC in Electron main process
> 3. Create OAuthService for PKCE flow management
> 4. Rewrite authStore to use OAuth2 + safeStorage instead of localStorage
> 5. Update UI with OAuth2 login button, callback handling, and WS token refresh
>
> ## Key Architecture
> - Electron main: `src/main/index.ts` — BrowserWindow, currently sandbox: false
> - Preload: `src/preload/index.ts` — contextBridge with window.api
> - Auth store: `src/renderer/stores/authStore.ts` — Zustand store, currently uses localStorage
> - API service: `src/renderer/services/api.ts` — fetch wrapper with token refresh via POST /api/auth/refresh
> - WS service: `src/renderer/services/ws.ts` — WebSocketService class with IDENTIFY, HEARTBEAT, SUBSCRIBE
> - Login form: `src/renderer/components/auth/LoginForm.tsx` — email/password form
> - App: `src/renderer/App.tsx` — checks localStorage on mount for session restore
>
> ## Interface Contracts (agreed with backend stream)
> - Hydra authority URL: `http://localhost:4444`
> - OAuth2 client_id: `thicket-desktop`
> - Scopes: `openid offline_access profile`
> - Redirect URI: `thicket://auth/callback`
> - PKCE method: S256
> - Access token format: RS256 JWT
> - WebSocket TOKEN_REFRESH event: `{ type: "TOKEN_REFRESH", data: { token: "..." } }`
> - WebSocket SESSION_EXPIRED event: `{ type: "SESSION_EXPIRED" }` + close code 4001
>
> ## Commit Discipline — IMPORTANT
> You MUST make one atomic commit per task below. Follow these rules strictly:
> - Complete each task fully before committing
> - Verify TypeScript compiles and tests pass BEFORE each commit
> - Use the exact commit messages provided below
> - NEVER combine multiple tasks into one commit
>
> ## Commit Sequence
>
> ### Commit 1: `chore(deps): add oidc-client-ts and electron-store`
> - Add to frontend/package.json dependencies: `oidc-client-ts`, `electron-store`
> - Run `npm install`
> - Verify: `npm install` succeeds, no dependency conflicts
>
> ### Commit 2: `feat(electron): add thicket:// protocol and safeStorage IPC handlers`
> - Modify `src/main/index.ts`:
>   - Register `thicket://` custom protocol via `app.setAsDefaultProtocolClient('thicket')`
>   - Handle `open-url` event (macOS) to capture OAuth callback URL
>   - Handle `second-instance` event (Windows/Linux) for callback URL
>   - Forward callback URL to renderer via `mainWindow.webContents.send('auth-callback', url)`
>   - Add IPC handlers using `safeStorage`:
>     - `auth:can-encrypt` → `safeStorage.isEncryptionAvailable()`
>     - `auth:get-storage-backend` → `safeStorage.getSelectedStorageBackend()` (detect keyring on Linux)
>     - `auth:store-tokens` → encrypt and store tokens via electron-store + safeStorage
>     - `auth:get-tokens` → decrypt and return tokens
>     - `auth:clear-tokens` → remove stored tokens
>   - Enable `sandbox: true` on BrowserWindow webPreferences
> - Modify `src/preload/index.ts`:
>   - Add `auth` methods to the api object exposed via contextBridge:
>     - `canEncrypt: () => ipcRenderer.invoke('auth:can-encrypt')`
>     - `getStorageBackend: () => ipcRenderer.invoke('auth:get-storage-backend')`
>     - `storeTokens: (tokens) => ipcRenderer.invoke('auth:store-tokens', tokens)`
>     - `getTokens: () => ipcRenderer.invoke('auth:get-tokens')`
>     - `clearTokens: () => ipcRenderer.invoke('auth:clear-tokens')`
>     - `onCallback: (cb) => ipcRenderer.on('auth-callback', (_, url) => cb(url))`
> - Modify `src/preload/index.d.ts`:
>   - Update Window.api type to include auth methods
> - Verify: `npm run type-check` passes
>
> ### Commit 3: `feat(oauth): implement OAuth2 PKCE service and update auth types`
> - Create `src/renderer/services/oauth.ts`:
>   - `OAuthService` class using oidc-client-ts UserManager:
>     - Configure with Hydra authority URL, client_id, redirect_uri, PKCE S256
>     - `startLogin()` — generates PKCE verifier/challenge, opens auth URL in system browser via `window.open()` or shell.openExternal
>     - `handleCallback(url: string)` — extracts auth code from callback URL, exchanges for tokens via UserManager
>     - `refreshToken(refreshToken: string)` — manual token refresh via Hydra token endpoint
>     - `logout()` — revokes tokens
>   - Export singleton instance
> - Modify `src/renderer/types/api.ts`:
>   - Add `OAuthTokens` interface: `{ access_token: string, refresh_token: string, id_token?: string, expires_at: number }`
>   - Keep existing types for backward compatibility during migration
> - Verify: `npm run type-check` passes
>
> ### Commit 4: `feat(auth): rewrite auth store and API service for OAuth2 safeStorage`
> - Modify `src/renderer/stores/authStore.ts`:
>   - Remove all localStorage usage
>   - Add `initAuth()` — loads tokens from safeStorage on app startup via `window.api.auth.getTokens()`
>   - Add `startLogin()` — initiates PKCE flow via OAuthService (opens system browser)
>   - Add `handleCallback(url: string)` — completes OAuth flow, stores tokens in safeStorage
>   - Add `refreshAccessToken()` — uses OAuthService.refreshToken()
>   - Modify `logout()` — clears safeStorage + revokes tokens via OAuthService
>   - Keep legacy `login(email, password)` and `signup(username, email, password)` as secondary methods during dual-mode period
>   - Refresh token never held in renderer memory (main process handles storage)
> - Modify `src/renderer/services/api.ts`:
>   - Update `refreshAccessToken()` to use OAuth service instead of POST /api/auth/refresh
>   - Keep existing request wrapper, just change the refresh mechanism
> - Verify: `npm run type-check` passes
>
> ### Commit 5: `feat(ui): add OAuth2 login, callback handling, and WS token refresh`
> - Modify `src/renderer/components/auth/LoginForm.tsx`:
>   - Add "Sign in with Thicket" button as PRIMARY login method (calls authStore.startLogin())
>   - Keep legacy email/password form as SECONDARY option (collapsible, "Or sign in with email")
>   - Note: Registration happens via Kratos in system browser
> - Modify `src/renderer/App.tsx`:
>   - Set up auth callback listener: `window.api.auth.onCallback((url) => handleCallback(url))`
>   - Replace localStorage check with `initAuth()` call on mount
> - Modify `src/renderer/services/ws.ts`:
>   - Add `sendTokenRefresh(newToken: string)` method — sends `{ type: "TOKEN_REFRESH", data: { token: newToken } }`
>   - Handle `SESSION_EXPIRED` event in dispatch → trigger re-auth via authStore
>   - Handle close code 4001 → stop reconnection, redirect to login
> - Modify `src/renderer/types/ws.ts`:
>   - Add `TOKEN_REFRESH` and `SESSION_EXPIRED` to WSEventType union
> - Verify: `npm run type-check` passes, `npm test` passes
>
> ## Boundaries
> - ONLY modify files in: `frontend/`
> - Do NOT touch: `backend/`, `ory/`, `docker-compose*`
>
> ## Done When
> - [ ] All 5 commits made in order
> - [ ] Each commit passes its verification step
> - [ ] `npm run type-check` passes
> - [ ] `npm test` passes
> - [ ] `git log --oneline` shows clean, atomic history

---

### Worktree: `stream-migration-cli`
- **Branch**: `feat/migration-cli`
- **Purpose**: CLI tool to migrate existing users to Kratos identities without password resets (plan Phase 5).
- **Depends on**: Phase 0 (foundation) — needs kratos_id column on users table
- **Commit sequence**:

| # | Commit message | Files | Verify |
|---|---------------|-------|--------|
| 1 | `feat(cli): implement Kratos identity migration tool` | `backend/cmd/migrate-identities/main.go` | `go build ./cmd/migrate-identities/` passes |

- **Done when**: CLI tool builds, can read users without kratos_id, create Kratos identities with bcrypt password import, set kratos_id on app users. Idempotent and safe to run multiple times.
- **Claude Code prompt**:

> You are working on the Thicket Discord clone in a git worktree dedicated to the user migration CLI tool.
>
> ## Context
> Thicket is migrating from custom auth to Ory Kratos. Existing users in the database need Kratos identities created for them so they can log in via Kratos with their existing passwords. The foundation branch has already added a `kratos_id` UUID column to the users table.
>
> ## Your Goal
> Create a standalone CLI tool at `backend/cmd/migrate-identities/main.go` that migrates existing users to Kratos.
>
> ## Commit Discipline — IMPORTANT
> Make exactly one atomic commit with the message below.
>
> ## Commit Sequence
>
> ### Commit 1: `feat(cli): implement Kratos identity migration tool`
> - Create `backend/cmd/migrate-identities/main.go`:
>   - CLI flags: `--db-url` (postgres connection string), `--kratos-admin-url` (default http://localhost:4434), `--dry-run` (preview without making changes)
>   - Query: `SELECT * FROM users WHERE kratos_id IS NULL`
>   - For each user:
>     - Create Kratos identity via Admin API POST `/admin/identities`:
>       - Schema: "thicket"
>       - Traits: `{ username, email, display_name }`
>       - Credentials: `{ password: { config: { hashed_password: user.password_hash } } }` (Kratos v1.3+ supports bcrypt import)
>     - On success: `UPDATE users SET kratos_id = $kratosIdentityID WHERE id = $userID`
>   - Idempotent: skip users where kratos_id is already set
>   - Handle errors gracefully: log and continue to next user
>   - Print summary: migrated/skipped/failed counts
>   - Uses standard library net/http for Kratos API calls (no SDK dependency)
>   - Uses pgx/v5 directly for database queries (no sqlc dependency needed)
> - Verify: `cd backend && go build ./cmd/migrate-identities/`
>
> ## Boundaries
> - ONLY create: `backend/cmd/migrate-identities/main.go`
> - Do NOT touch any other files
>
> ## Done When
> - [ ] Commit made
> - [ ] `go build ./cmd/migrate-identities/` passes
> - [ ] `git log --oneline` shows single clean commit

---

## Phase 2: Integration

> After all Phase 1 streams are merged to main. Implements plan Phase 6: remove legacy auth, RS256-only.

### Worktree: `integration`
- **Branch**: `feat/legacy-removal`
- **Purpose**: Remove all legacy HS256 auth code, make Kratos + Hydra the sole auth system. Clean up deprecated code, update all tests to RS256-only.
- **Depends on**: All Phase 1 streams merged to main
- **Commit sequence**:

| # | Commit message | Files | Verify |
|---|---------------|-------|--------|
| 1 | `refactor(auth): switch to RS256-only JWKS middleware and remove legacy auth` | `backend/internal/auth/middleware.go`, `backend/internal/router/router.go`, `backend/internal/ws/handler.go`, `backend/cmd/server/main.go`, delete: `backend/internal/auth/{jwt.go, password.go}`, `backend/internal/service/auth_service.go`, `backend/internal/handler/auth_handler.go`, `backend/internal/database/queries/sessions.sql` | `go build ./...` passes |
| 2 | `feat(db): remove sessions table and password_hash column` | `backend/internal/database/migrations/000003_remove_sessions.{up,down}.sql`, `backend/internal/models/models.go`, `backend/internal/config/config.go`, regenerate sqlc | `sqlc generate` passes, `go build ./...` passes |
| 3 | `test: update all tests to RS256-only using TestJWKS helper` | `backend/internal/**/*_test.go` | `go test ./...` all pass |

- **Done when**: No legacy auth code remains, all tests pass with RS256-only, `go test ./...` green, clean build.
- **Claude Code prompt**:

> You are working on the Thicket Discord clone in a git worktree dedicated to removing legacy authentication code.
>
> ## Context
> Thicket has completed its migration to Ory Kratos + Hydra for authentication. The codebase currently has BOTH legacy HS256 auth AND new RS256/OAuth2 auth. Your job is to remove all legacy auth code, making Kratos + Hydra the sole auth system.
>
> ## Your Goal
> 1. Remove DualMiddleware, replace with RS256-only JWKS validation
> 2. Delete legacy auth files (jwt.go, password.go, auth_service.go, auth_handler.go, sessions.sql)
> 3. Remove /api/auth/* legacy routes
> 4. Remove WS HS256 fallback
> 5. Add migration to drop sessions table and password_hash column
> 6. Update all tests to RS256-only
>
> ## Key Files to Remove
> - `backend/internal/auth/jwt.go` — HS256 JWTManager (replaced by JWKSManager)
> - `backend/internal/auth/password.go` — bcrypt password functions (Kratos handles passwords)
> - `backend/internal/service/auth_service.go` — legacy signup/login/refresh/logout service
> - `backend/internal/handler/auth_handler.go` — legacy HTTP handler (move Me endpoint to a user handler or inline in router)
> - `backend/internal/database/queries/sessions.sql` — Hydra manages sessions now
>
> ## Commit Discipline — IMPORTANT
> You MUST make one atomic commit per task below. Follow these rules strictly:
> - Complete each task fully before committing
> - Verify the build passes BEFORE each commit
> - Use the exact commit messages provided below
>
> ## Commit Sequence
>
> ### Commit 1: `refactor(auth): switch to RS256-only JWKS middleware and remove legacy auth`
> - Modify `backend/internal/auth/middleware.go`:
>   - Remove `DualMiddleware` function
>   - Replace `Middleware` to accept `*JWKSManager` instead of `*JWTManager` — RS256 only
> - Modify `backend/internal/router/router.go`:
>   - Remove JWTManager from Config (keep JWKSManager)
>   - Remove `/api/auth/*` routes (signup, login, refresh, logout)
>   - Keep `/api/me` — move handler inline or to a small user handler
>   - Update auth middleware to use RS256-only Middleware
> - Modify `backend/internal/ws/handler.go`:
>   - Remove HS256 JWTManager from Handler signature
>   - IDENTIFY validation: RS256 only via JWKSManager
> - Modify `backend/cmd/server/main.go`:
>   - Remove JWTManager, AuthService, AuthHandler construction
>   - Remove from router Config
> - Delete: `backend/internal/auth/jwt.go`, `backend/internal/auth/password.go`, `backend/internal/service/auth_service.go`, `backend/internal/handler/auth_handler.go`, `backend/internal/database/queries/sessions.sql`
> - Verify: `cd backend && go build ./...` (tests may fail — that's OK, fixed in commit 3)
>
> ### Commit 2: `feat(db): remove sessions table and password_hash column`
> - Create `backend/internal/database/migrations/000003_remove_sessions.up.sql`:
>   ```sql
>   DROP TABLE IF EXISTS sessions;
>   ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
>   ALTER TABLE users ALTER COLUMN kratos_id SET NOT NULL;
>   ```
> - Create `backend/internal/database/migrations/000003_remove_sessions.down.sql`:
>   ```sql
>   ALTER TABLE users ALTER COLUMN kratos_id DROP NOT NULL;
>   ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL DEFAULT '';
>   CREATE TABLE IF NOT EXISTS sessions (...);
>   ```
> - Run `cd backend && sqlc generate` — this will regenerate models without Session type and without PasswordHash on User
> - Modify `backend/internal/config/config.go`:
>   - Remove `JWTConfig` struct (Secret, AccessExpiry, RefreshExpiry)
>   - Remove `JWT JWTConfig` from Config
>   - Remove JWT env var loading
> - Verify: `cd backend && sqlc generate && go build ./...`
>
> ### Commit 3: `test: update all tests to RS256-only using TestJWKS helper`
> - Update all test files that use HS256 JWTManager to use `testutil.TestJWKSServer` instead
> - Remove any tests for deleted functions (HS256 token creation, password hashing, legacy auth service)
> - Ensure all handler/service tests create RS256 tokens via TestJWKSServer.CreateToken()
> - Verify: `cd backend && go test ./...` ALL pass
>
> ## Boundaries
> - Modify/delete files across the entire backend as needed
> - Do NOT touch: `frontend/`, `ory/`, `docker-compose*`
>
> ## Done When
> - [ ] All 3 commits made in order
> - [ ] No legacy auth code remains (jwt.go, password.go, auth_service.go, auth_handler.go, sessions.sql all deleted)
> - [ ] `go test ./...` passes with RS256-only
> - [ ] `git log --oneline` shows clean, atomic history

---

## Setup Script

```bash
#!/bin/bash
set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")
BASE_BRANCH=$(git branch --show-current)

echo "Setting up worktrees for: $REPO_NAME"
echo "   Base branch: $BASE_BRANCH"
echo ""

# Phase 0: Foundation
echo "Creating foundation worktree..."
git worktree add "../${REPO_NAME}-wt-foundation" -b feat/jwks-foundation "$BASE_BRANCH"
(cd "../${REPO_NAME}-wt-foundation/backend" && go mod download)

# Phase 1: Parallel streams (create now, work on after foundation merges)
echo "Creating parallel worktrees..."
git worktree add "../${REPO_NAME}-wt-backend-ory" -b feat/ory-backend "$BASE_BRANCH"
(cd "../${REPO_NAME}-wt-backend-ory/backend" && go mod download)

git worktree add "../${REPO_NAME}-wt-frontend-oauth" -b feat/oauth-frontend "$BASE_BRANCH"
(cd "../${REPO_NAME}-wt-frontend-oauth/frontend" && npm install)

git worktree add "../${REPO_NAME}-wt-migration-cli" -b feat/migration-cli "$BASE_BRANCH"
(cd "../${REPO_NAME}-wt-migration-cli/backend" && go mod download)

echo ""
echo "All worktrees created! Run 'git worktree list' to see them."
echo ""
echo "Workflow:"
echo "   1. cd ../${REPO_NAME}-wt-foundation && claude"
echo "      (Complete foundation work, push branch)"
echo ""
echo "   2. Merge foundation into main (or each parallel branch):"
echo "      cd ../${REPO_NAME}-wt-backend-ory && git merge feat/jwks-foundation"
echo "      cd ../${REPO_NAME}-wt-frontend-oauth && git merge feat/jwks-foundation"
echo "      cd ../${REPO_NAME}-wt-migration-cli && git merge feat/jwks-foundation"
echo ""
echo "   3. Launch Claude Code in each parallel worktree simultaneously:"
echo "      cd ../${REPO_NAME}-wt-backend-ory && claude"
echo "      cd ../${REPO_NAME}-wt-frontend-oauth && claude"
echo "      cd ../${REPO_NAME}-wt-migration-cli && claude"
echo ""
echo "   4. After all parallel streams complete, merge to main, then:"
echo "      git worktree add ../${REPO_NAME}-wt-integration -b feat/legacy-removal main"
echo "      cd ../${REPO_NAME}-wt-integration && claude"
```

## Merge Order

Merge branches back to main in this order:

1. **`feat/jwks-foundation`** → main (Phase 0 — must be first)
2. **`feat/migration-cli`** → main (standalone, no conflicts)
3. **`feat/ory-backend`** → main (backend Ory + WS changes)
4. **`feat/oauth-frontend`** → main (frontend changes — zero backend file overlap)
5. **`feat/legacy-removal`** → main (Phase 2 — must be last, cleans up everything)

Steps 2-4 can be merged in any order since they have zero file overlap, but the suggested order goes from least to most impactful.
