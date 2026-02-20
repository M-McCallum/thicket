Modify backend/internal/router/router.go — Add JWKSManager and Queries
      to Config, switch protected group to DualMiddleware

     Modify backend/cmd/server/main.go — Construct JWKSManager, pass to
     router

     Create backend/internal/testutil/testjwks.go — Test helper: generates RSA
     keypair, serves JWKS via httptest, creates signed RS256 tokens

     Verification

     - All existing tests pass (HS256 path still works)
     - New JWKS tests pass
     - Electron app unchanged (still uses HS256)

     ---
     Phase 2: Login/Consent Provider Endpoints

     Goal: Implement the Go/Fiber endpoints that bridge Kratos login flows and
     Hydra OAuth2 challenges. This is the server-side core of the OAuth2 flow.

     Changes

     Create backend/internal/ory/client.go — HTTP clients for Kratos Admin +
     Hydra Admin APIs (plain net/http, no SDK dependency):
     - KratosClient: GetIdentity, CreateIdentity
     - HydraClient: GetLoginRequest, AcceptLoginRequest, GetConsentRequest,
     AcceptConsentRequest, RevokeConsentSessions, RevokeRefreshTokens

     Create backend/internal/ory/types.go — Request/response types matching
     Hydra/Kratos Admin API JSON

     Create backend/internal/ory/client_test.go — Tests with httptest mock
     servers

     Create backend/internal/service/identity_service.go — IdentityService:
     - FindOrCreateUser(ctx, kratosID) — finds app user by kratos_id, or creates
     one from Kratos traits
     - SyncTraits(ctx, kratosID) — updates username/email from Kratos on login

     Create backend/internal/handler/ory_handler.go — Hydra provider endpoints:
     ┌──────────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────┐
     │                                 Endpoint                                 │                         Purpose                          │
     ├──────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │ GET /auth/login                                                          │ Hydra redirects here with ?login_challenge=.... If       │
     ├──────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │ skip=true, auto-accept. Otherwise redirect to Kratos self-service login. │                                                          │
     ├──────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │ POST /auth/login                                                         │ After Kratos authenticates, accept Hydra login challenge │
     ├──────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │ with Kratos identity UUID as subject.                                    │                                                          │
     ├──────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │ GET /auth/consent                                                        │ Auto-accept consent for first-party Thicket clients.     │
     ├──────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │ GET /auth/logout                                                         │ Revoke Hydra tokens, destroy Kratos session, redirect to │
     ├──────────────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────┤
     │ login.                                                                   │                                                          │
     └──────────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────┘
     Modify backend/internal/router/router.go — Add /auth/* route group (no
     auth middleware — called by Hydra/Kratos redirects). Existing /api/auth/*
     routes unchanged.

     Modify backend/cmd/server/main.go — Construct KratosClient,
     HydraClient, IdentityService, OryHandler, pass to router

     Verification

     - Full OAuth2 flow testable via curl:
       a. GET /oauth2/auth on Hydra with PKCE params
       b. Follow redirects through login → consent → callback
       c. Exchange auth code for tokens at Hydra's token endpoint
       d. Use RS256 access token to hit GET /api/me
     - Legacy auth still works, Electron app unchanged

     ---
     Phase 3: Electron OAuth2 PKCE + safeStorage

     Goal: Migrate Electron client from direct login to OAuth2 PKCE flow with
     OS-level encrypted token storage.

     Changes

     Modify frontend/package.json — Add oidc-client-ts, electron-store

     Modify frontend/src/main/index.ts:
     - Register thicket:// custom protocol via app.setAsDefaultProtocolClient
     - Handle open-url (macOS) and second-instance (Win/Linux) events for OAuth2
     callback
     - Add IPC handlers for safeStorage: auth:store-tokens, auth:get-tokens,
     auth:clear-tokens, auth:can-encrypt, auth:get-storage-backend
     - Enable sandbox: true on BrowserWindow (was false)
     - Forward auth-callback URL to renderer via webContents.send

     Modify frontend/src/preload/index.ts — Expose window.api.auth via
     contextBridge:
     - canEncrypt(), getStorageBackend(), storeTokens(), getTokens(),
     clearTokens(), onCallback()

     Create frontend/src/renderer/services/oauth.ts — OAuthService:
     - Manages oidc-client-ts UserManager with Hydra authority, PKCE S256
     - startLogin() — generates PKCE challenge, opens auth URL in system browser
     - handleCallback(url) — exchanges auth code for tokens
     - refreshToken(refreshToken) — manual token refresh via Hydra
     - logout() — revokes tokens via Hydra

     Modify frontend/src/renderer/stores/authStore.ts — Rewrite:
     - Remove localStorage usage entirely
     - initAuth() — loads tokens from safeStorage on app startup
     - startLogin() — initiates PKCE flow (opens system browser)
     - handleCallback(url) — completes flow, stores tokens in safeStorage
     - refreshAccessToken() — uses OAuthService.refreshToken()
     - logout() — clears safeStorage + revokes tokens
     - Refresh token never held in renderer memory (stays in main process)

     Modify frontend/src/renderer/services/api.ts — Update token refresh to use
      OAuth service instead of /api/auth/refresh

     Modify frontend/src/renderer/components/auth/LoginForm.tsx — Add "Sign in
     with Thicket" OAuth2 button as primary login method. Keep legacy email/password
     form as secondary option during dual-mode period (removed in Phase 6).
     Registration happens via Kratos in system browser.

     Modify frontend/src/renderer/App.tsx — Set up auth callback listener via
     window.api.auth.onCallback, call initAuth() on mount

     Modify frontend/src/renderer/types/api.ts — Update AuthResponse for
     Hydra token format

     Verification

     - Click "Sign in" → system browser opens Kratos login
     - Enter credentials → thicket://auth/callback redirects back to Electron
     - App authenticated, tokens encrypted via safeStorage
     - Close/reopen app → session restored from safeStorage
     - Token refresh works transparently
     - Linux: warning if no keyring manager detected

     ---
     Phase 4: WebSocket Auth Migration

     Goal: WebSocket handler accepts RS256 tokens and supports mid-connection
     token refresh.

     Changes

     Modify backend/internal/ws/events.go — Add event types:
     - TOKEN_REFRESH (client → server): { token: string }
     - SESSION_EXPIRED (server → client): close code 4001

     Modify backend/internal/ws/handler.go — Update Handler() signature to
     accept jwksManager + queries. During IDENTIFY: try HS256 first, then RS256
     (dual validation, same as HTTP middleware).

     Modify backend/internal/ws/client.go — Handle TOKEN_REFRESH in
     handleEvent:
     - Validate new token (dual HS256/RS256)
     - If valid and same user: update client credentials
     - If invalid: send SESSION_EXPIRED, close with code 4001

     Modify frontend/src/renderer/services/ws.ts:
     - sendTokenRefresh(newToken) — sends TOKEN_REFRESH event when access token
     is refreshed
     - Handle SESSION_EXPIRED event → trigger re-auth
     - Handle close code 4001 → stop reconnection, redirect to login

     Modify backend/internal/router/router.go — Pass jwksManager and
     queries to WS handler

     Verification

     - Electron connects WebSocket with RS256 token
     - After access token refresh, TOKEN_REFRESH sent to server
     - If Hydra session revoked, SESSION_EXPIRED sent and connection closes with
     4001
     - Legacy HS256 still works during migration

     ---
     Phase 5: Existing User Migration

     Goal: Migrate existing users to Kratos identities without password resets.

     Changes

     Create backend/cmd/migrate-identities/main.go — CLI tool:
     - Reads users where kratos_id IS NULL
     - Creates Kratos identity via Admin API with username + email traits
     - Imports existing bcrypt password hashes (Kratos v1.3+ supports
     credentials.password.config.hashed_password)
     - Sets kratos_id on the app user record
     - Idempotent (safe to run multiple times)
     - Logs report of migrated/skipped/failed users

     Verification

     - Run against dev database with test users
     - All users get kratos_id set
     - Users can log in via Kratos with existing passwords
     - Legacy HS256 login still works (both paths active)

     ---
     Phase 6: Legacy Auth Removal + MFA

     Goal: Remove custom auth code. Kratos + Hydra is the sole auth system.
     Enable MFA.

     Changes

     Modify backend/internal/router/router.go — Remove /api/auth/* routes
     (signup, login, refresh, logout)

     Modify backend/internal/auth/middleware.go — Remove DualMiddleware,
     replace Middleware with RS256-only JWKS validation

     Delete backend/internal/auth/jwt.go — HS256 JWTManager no longer needed
     Delete backend/internal/auth/password.go — Kratos handles passwords
     Delete backend/internal/service/auth_service.go — Legacy auth service
     Delete backend/internal/handler/auth_handler.go — Legacy auth handler
     (move Me to a new user handler or inline)
     Delete backend/internal/database/queries/sessions.sql — Hydra manages
     sessions

     Create backend/internal/database/migrations/000003_remove_sessions.up.sql
     DROP TABLE IF EXISTS sessions;
     ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
     ALTER TABLE users ALTER COLUMN kratos_id SET NOT NULL;

     Modify backend/internal/models/models.go — Remove Session, remove
     PasswordHash from User, make KratosID non-pointer

     Modify backend/internal/config/config.go — Remove JWTConfig (Secret,
     AccessExpiry, RefreshExpiry)

     Modify backend/internal/ws/handler.go — Remove HS256 path, RS256 only

     Modify backend/cmd/server/main.go — Remove JWTManager, AuthService,
     AuthHandler construction

     Update ory/kratos/kratos.yml — Production WebAuthn config (domain,
     origins)

     Update tests: Remove HS256 tests, update all to use testutil.TestJWKS
     helper for RS256

     Verification

     - No legacy auth code remains
     - All tests pass with RS256-only
     - MFA enrollment works: WebAuthn, TOTP, recovery codes
     - Account recovery via email works
     - Full regression: login → use app → token refresh → logout

     ---
     File Inventory

     New Files (18)
     ┌──────────────────────────────────────────────────────────────────────┬───────┐
     │                                 File                                 │ Phase │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ ory/init-databases.sql                                               │ 0     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ ory/kratos/kratos.yml                                                │ 0     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ ory/kratos/identity.schema.json                                      │ 0     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ ory/register-clients.sh                                              │ 0     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/auth/jwks.go                                        │ 1     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/auth/jwks_test.go                                   │ 1     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/database/migrations/000002_add_kratos_id.up.sql     │ 1     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/database/migrations/000002_add_kratos_id.down.sql   │ 1     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/testutil/testjwks.go                                │ 1     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/ory/client.go                                       │ 2     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/ory/types.go                                        │ 2     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/ory/client_test.go                                  │ 2     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/handler/ory_handler.go                              │ 2     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/service/identity_service.go                         │ 2     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ frontend/src/renderer/services/oauth.ts                              │ 3     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/cmd/migrate-identities/main.go                               │ 5     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/database/migrations/000003_remove_sessions.up.sql   │ 6     │
     ├──────────────────────────────────────────────────────────────────────┼───────┤
     │ backend/internal/database/migrations/000003_remove_sessions.down.sql │ 6     │
     └──────────────────────────────────────────────────────────────────────┴───────┘
     Modified Files (20)
     ┌─────────────────────────────────────────────────────┬────────────┐
     │                        File                         │  Phase(s)  │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ docker-compose.dev.yml                              │ 0          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ docker-compose.yml                                  │ 0          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ backend/internal/models/models.go                   │ 1, 6       │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ backend/internal/models/users.go                    │ 1          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ backend/internal/database/queries/users.sql         │ 1          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ backend/internal/auth/middleware.go                 │ 1, 6       │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ backend/internal/config/config.go                   │ 1, 6       │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ backend/internal/router/router.go                   │ 1, 2, 4, 6 │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ backend/cmd/server/main.go                          │ 1, 2, 6    │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ backend/internal/ws/events.go                       │ 4          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ backend/internal/ws/handler.go                      │ 4, 6       │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ backend/internal/ws/client.go                       │ 4          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ frontend/package.json                               │ 3          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ frontend/src/main/index.ts                          │ 3          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ frontend/src/preload/index.ts                       │ 3          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ frontend/src/renderer/stores/authStore.ts           │ 3          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ frontend/src/renderer/services/api.ts               │ 3          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ frontend/src/renderer/services/ws.ts                │ 4          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ frontend/src/renderer/components/auth/LoginForm.tsx │ 3          │
     ├─────────────────────────────────────────────────────┼────────────┤
     │ frontend/src/renderer/App.tsx                       │ 3          │
     └─────────────────────────────────────────────────────┴────────────┘
     Deleted Files (Phase 6)
     ┌────────────────────────────────────────────────┬───────────────────────────────────┐
     │                      File                      │              Reason               │
     ├────────────────────────────────────────────────┼───────────────────────────────────┤
     │ backend/internal/auth/jwt.go                   │ HS256 JWTManager replaced by JWKS │
     ├────────────────────────────────────────────────┼───────────────────────────────────┤
     │ backend/internal/auth/password.go              │ Kratos handles passwords          │
     ├────────────────────────────────────────────────┼───────────────────────────────────┤
     │ backend/internal/service/auth_service.go       │ Legacy auth service               │
     ├────────────────────────────────────────────────┼───────────────────────────────────┤
     │ backend/internal/handler/auth_handler.go       │ Legacy handler                    │
     ├────────────────────────────────────────────────┼───────────────────────────────────┤
     │ backend/internal/database/queries/sessions.sql │ Hydra manages sessions            │
     └────────────────────────────────────────────────┴───────────────────────────────────┘
     ---
     Security Checklist

     - PKCE S256 mandatory on all clients
     - Refresh token rotation with family revocation
     - 15-minute access token lifetime (RS256)
     - No PII in JWT claims (sub is opaque Kratos UUID)
     - Audience validation (api.thicket.chat)
     - Argon2id password hashing (128MB, 3 iterations)
     - Electron safeStorage (OS-level encryption)
     - Linux fallback detection for missing keyring
     - MFA: WebAuthn > TOTP > Recovery codes (no SMS)
     - No client secrets (public OAuth2 clients)
     - WebSocket TOKEN_REFRESH + SESSION_EXPIRED (code 4001)
     - BFF pattern ready for future web client
