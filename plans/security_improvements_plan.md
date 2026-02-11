# Thicket Security & Performance Implementation Plan

## Context

The project is a self-hosted Discord clone (Go + Fiber backend, Electron + React frontend) with Phase 1 complete: auth, models, services, handlers, WS hub, and Electron shell. All 37 tests pass. The codebase has solid architecture but significant security gaps: no rate limiting beyond auth endpoints, `sandbox: false` in Electron, tokens in plaintext localStorage, `ws://` instead of `wss://`, no message encryption, no file uploads, and no pprof/observability.

This plan implements the recommendations from the Security & Performance Architecture Guide across 8 phases, progressing from backend hardening through to full Signal Protocol / MLS end-to-end encryption.

---

## Phase 1: Backend Hardening

**Goal**: Harden the Go server against common attack vectors without changing client-facing APIs.

### Changes

**New file: `backend/internal/middleware/security.go`**
- Fiber middleware setting security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Conditionally set `Strict-Transport-Security` when `ENV=production`

**Modify: `backend/internal/router/router.go`**
- Add security headers middleware after recover/logger
- Add rate limiter on protected API group (60 req/min per IP)
- Add rate limiter on `/ws` endpoint (5 connections/min per IP)

**Modify: `backend/cmd/server/main.go`**
- Set `BodyLimit: 64 * 1024` (64KB) in Fiber config for text-only API
- Start pprof HTTP server on `127.0.0.1:6060` (internal only, separate goroutine)
- Start message cleanup goroutine (daily, deletes messages older than `MESSAGE_TTL_DAYS`)

**Modify: `backend/internal/config/config.go`**
- Add `PprofPort` field (default `"6060"`)
- Add `MessageTTLDays` field (default `90`)
- When `Env == "production"` and `DB_SSL_MODE` not explicitly set, override to `"require"`

**Modify: `backend/internal/ws/handler.go`**
- Accept allowed origins + env mode in `Handler()` signature
- `CheckOrigin` validates against configured CORS origin in production; permissive in development
- Pass config from router.go

**New file: `backend/internal/service/cleanup_service.go`**
- Background goroutine running every 24h
- `DELETE FROM messages WHERE created_at < NOW() - INTERVAL 'N days'` with batch deletes

**New file: `backend/internal/middleware/security_test.go`**
- Test security headers presence
- Test HSTS only in production mode

### Verification
- All 22 existing Go tests still pass
- New middleware test passes
- `curl -I` shows security headers
- pprof accessible at `localhost:6060/debug/pprof/`

---

## Phase 2: Electron Hardening

**Goal**: Fix Electron security — sandbox, IPC handlers, secure token storage, CSP tightening, idle lock.

### Changes

**Modify: `frontend/src/main/index.ts`**
- Change `sandbox: false` to `sandbox: true`
- Add `ipcMain.on` handlers for `minimize-window`, `maximize-window`, `close-window`
- Add `ipcMain.handle` for `get-window-state`
- Add `safeStorage`-based IPC handlers for secure token storage:
  - `secure-store-set-tokens` / `secure-store-get-tokens` / `secure-store-clear-tokens`
  - `secure-store-set-user` / `secure-store-get-user`
  - Encrypted data stored in JSON file at `app.getPath('userData')/tokens.enc`
  - Falls back to unencrypted with warning if `safeStorage.isEncryptionAvailable()` is false

**Modify: `frontend/src/preload/index.ts`**
- Add `secureStore` API exposed via `contextBridge`:
  - `setTokens(access, refresh)`, `getTokens()`, `clearTokens()`
  - `setUser(userJson)`, `getUser()`

**Modify: `frontend/src/preload/index.d.ts`**
- Add type declarations for `window.secureStore`

**Modify: `frontend/src/renderer/stores/authStore.ts`**
- Replace all `localStorage.setItem/getItem/removeItem` calls with `window.secureStore.*` (async)
- `setTokensFromStorage` becomes async

**Modify: `frontend/src/renderer/App.tsx`**
- Initialization `useEffect` calls `window.secureStore.getTokens()` (async) instead of `localStorage`

**Bundle fonts locally:**
- Download Inter, Orbitron, Share Tech Mono as woff2 files
- Place in `frontend/src/renderer/assets/fonts/`
- Create `fonts.css` with `@font-face` declarations
- Import in `globals.css`

**Modify: `frontend/src/renderer/index.html`**
- Remove Google Fonts `<link>` tag
- Tighten CSP: remove `https://fonts.googleapis.com` and `https://fonts.gstatic.com`
- Keep `'unsafe-inline'` for styles only in dev (Tailwind/Vite HMR needs it); remove in production build

**New file: `frontend/src/renderer/hooks/useIdleLock.ts`**
- Listens for `mousemove`, `keydown`, `mousedown`
- After 15 min idle, calls `authStore.logout()` (clears secure store + disconnects WS)

**Modify: `frontend/src/renderer/App.tsx`**
- Use `useIdleLock` hook when authenticated

### Verification
- All 15 Vitest tests pass (mock `window.secureStore` instead of `localStorage`)
- Window title bar buttons (minimize, maximize, close) work
- Tokens no longer appear in localStorage
- CSP blocks external font loading
- App auto-locks after idle timeout

---

## Phase 3: Transport Security & WS Token Rotation

**Goal**: Enforce WSS, add JWT rotation on live WS connections, add security headers enforcement.

### Changes

**Modify: `frontend/src/renderer/services/ws.ts`**
- Make WS URL configurable: `import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws'`
- Listen for `TOKEN_REQUIRED` server event
- When received: call refresh endpoint for new access token, send `TOKEN_REFRESH` event back
- If refresh fails, disconnect and redirect to login

**Modify: `frontend/src/renderer/services/api.ts`**
- Make API base URL configurable: `import.meta.env.VITE_API_URL || 'http://localhost:8080'`

**Modify: `backend/internal/ws/events.go`**
- Add `EventTokenRefresh = "TOKEN_REFRESH"` and `EventTokenRequired = "TOKEN_REQUIRED"`

**Modify: `backend/internal/ws/client.go`**
- Add `tokenExpiry time.Time` and `jwtManager *auth.JWTManager` fields to `Client`
- Add token expiry timer: when token is within 2 min of expiry, send `TOKEN_REQUIRED`
- Handle `TOKEN_REFRESH` in `handleEvent`: validate new token, update expiry
- If client doesn't respond within 30s grace period, disconnect

**Modify: `backend/internal/ws/handler.go`**
- Pass `jwtManager` and token expiry to `NewClient()`
- Store `claims.ExpiresAt` on client

**Modify: `backend/internal/router/router.go`**
- Configure logger middleware to omit client IPs when `ENV=production`

**Modify: `frontend/src/renderer/types/ws.ts`**
- Add `TOKEN_REFRESH` and `TOKEN_REQUIRED` to `WSEventType`

**New file: `backend/internal/ws/token_rotation_test.go`**
- Test `TOKEN_REQUIRED` sent near expiry
- Test `TOKEN_REFRESH` with valid token updates client
- Test `TOKEN_REFRESH` with invalid token disconnects

### Verification
- Production builds connect via `wss://`
- WS connections survive token expiry (auto-rotate)
- Expired tokens cause graceful disconnect + re-auth
- No IP addresses in production logs

---

## Phase 4: WS Performance (Protobuf, Batching, Pooling)

**Goal**: Replace JSON wire format with protobuf, add typing coalescing, introduce sync.Pool, add write buffering.

### Changes

**New file: `backend/internal/ws/proto/events.proto`**
- Protobuf message definitions for all WS event types:
  ```protobuf
  message WSEvent { string type = 1; bytes data = 2; }
  message IdentifyData { string token = 1; string codec = 2; }
  message MessageData { string id = 1; string channel_id = 2; ... }
  // etc for each event type
  ```

**Generated: `backend/internal/ws/proto/events.pb.go`**
- Generated via `protoc` from the proto file

**New file: `backend/internal/ws/codec.go`**
- `Codec` interface: `Encode(event *Event) ([]byte, error)`, `Decode(data []byte) (*Event, error)`
- `JSONCodec` (current behavior, backward compatible)
- `ProtobufCodec` (binary, fast)
- Codec negotiated during IDENTIFY via `codec` field (default: `"json"`)

**Modify: `backend/internal/ws/client.go`**
- Add `codec Codec` field
- `ReadPump`: decode using `c.codec.Decode()`
- `WritePump`: encode using `c.codec.Encode()`, send `BinaryMessage` for protobuf / `TextMessage` for JSON
- Write buffering: after reading first message from `send` channel, drain additional queued messages into same write batch

**Modify: `backend/internal/ws/hub.go`**
- Pre-encode broadcasts once per codec type (avoid re-encoding per client)
- Add `sync.Pool` for `Event` structs: `eventPool = sync.Pool{New: func() any { return &Event{} }}`
- `AcquireEvent()` / `ReleaseEvent()` helpers

**New file: `backend/internal/ws/typing_batcher.go`**
- Per-channel typing event coalescing with 30ms flush timer
- `Add(channelID, userID, username)` accumulates; timer flushes as batched `TYPING_START`
- Uses `time.AfterFunc` per active channel, auto-cleans idle channels

**Modify: `backend/internal/ws/events.go`**
- Add pool-aware constructors

**Frontend changes:**
- Add `@bufbuild/protobuf` dependency
- Modify `frontend/src/renderer/services/ws.ts`: negotiate protobuf codec in IDENTIFY, encode/decode binary frames
- Add proto type definitions to `frontend/src/renderer/types/`

**New file: `backend/internal/ws/codec_test.go`**
- JSON and protobuf round-trip equivalence tests

**New file: `backend/internal/ws/bench_test.go`**
- Benchmark JSON vs protobuf encode/decode
- Benchmark with/without sync.Pool
- Benchmark typing batcher coalescing

### Verification
- All existing WS tests pass (JSON codec fallback)
- Benchmarks show measurable improvement (target: 3-5x faster encoding)
- Typing indicators coalesce correctly (no lost events, no stale indicators)
- `go tool pprof` shows reduced allocations in hot path

---

## Phase 5: Client-Side Encryption (Simple Symmetric — Stepping Stone)

**Goal**: Per-channel AES-256-GCM encryption as a practical stepping stone toward full E2EE. Protects data at rest and against DB breaches. This phase establishes the encryption infrastructure that Phase 7 will replace with Signal/MLS.

### Changes

**New file: `frontend/src/renderer/services/crypto.ts`**
- Uses Web Crypto API (`window.crypto.subtle`)
- `generateChannelKey()`: AES-256-GCM key generation
- `encryptMessage(key, plaintext)`: returns `base64(iv + ciphertext + tag)`
- `decryptMessage(key, encrypted)`: decodes and decrypts
- `exportKey(key)` / `importKey(base64)`: for storage/transfer

**New file: `frontend/src/renderer/stores/keyStore.ts`**
- Zustand store for per-channel encryption keys
- Keys stored via `window.secureStore` (from Phase 2)
- `getKey(channelId)` / `setKey(channelId, key)` / `generateAndStoreKey(channelId)`
- Key export/import for sharing with other users

**Modify: `frontend/src/renderer/stores/messageStore.ts`**
- `sendMessage`: encrypt content before API call; wrap as `{"v":1,"ct":"base64"}`
- `fetchMessages` / `addMessage`: detect encrypted format, decrypt with channel key
- If no key for channel, display `[Encrypted — import key to view]`

**Modify: `backend/internal/service/message_service.go`**
- Detect encrypted message format (`{"v":1,"ct":"..."}`) — validate JSON structure, skip HTML sanitization on encrypted payloads
- Store encrypted content as-is (opaque blob to server)

**New file: `frontend/src/renderer/services/localCache.ts`**
- IndexedDB-backed cache for decrypted messages (offline access)
- Encrypted at database level using user-specific key from secure store
- `getMessages(channelId)` / `putMessages(channelId, messages[])` / `clearCache()`

**New file: `frontend/src/renderer/components/chat/KeyManager.tsx`**
- UI for generating, exporting, and importing channel keys
- Shows key status per channel (has key / needs key)

### Verification
- Messages stored as ciphertext in PostgreSQL (verify via psql)
- Messages display correctly after decryption in client
- Key export/import flow works between two users
- Existing unencrypted messages continue to display (backward compat)
- New crypto unit tests pass

---

## Phase 6: File Uploads & Media

**Goal**: Add file upload support with client-side encryption, S3-compatible storage, link previews, and auto-updates.

### Changes

**New migration: `backend/internal/database/migrations/000002_add_attachments.up.sql`**
```sql
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_key VARCHAR(512) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_attachments_message_id ON attachments(message_id);
```

**New file: `backend/internal/service/upload_service.go`**
- S3-compatible storage using AWS SDK v2 (works with MinIO dev / Cloudflare R2 prod)
- `Upload(ctx, reader, filename, contentType) (url, error)`
- `GetPresignedURL(ctx, key) (url, error)` for private file access

**New file: `backend/internal/handler/upload_handler.go`**
- `POST /api/uploads` — multipart form upload
- File size validation (configurable, default 25MB)
- MIME type allowlist
- Returns file URL/key

**New file: `backend/internal/models/attachments.go`**
- Attachment CRUD queries

**Modify: `backend/internal/config/config.go`**
- Add `StorageConfig` with `Endpoint`, `Bucket`, `AccessKey`, `SecretKey`, `Region`

**Modify: `backend/internal/router/router.go`**
- Add upload route under protected group
- Set higher body limit (25MB) for upload route specifically

**Modify: `backend/cmd/server/main.go`**
- Wire up upload handler and service

**New file: `frontend/src/renderer/services/fileEncrypt.ts`**
- Encrypt file with random AES-256-GCM per-file key
- Encrypt file key with channel key
- Upload encrypted blob, send file key + URL in E2EE message payload

**New file: `frontend/src/renderer/components/chat/FileUpload.tsx`**
- Drag-and-drop + click-to-upload UI
- Upload progress indicator
- Integrates with ChatArea input

**Modify: `frontend/src/renderer/components/chat/ChatArea.tsx`**
- Add FileUpload component to input area

**New file: `frontend/src/renderer/components/chat/LinkPreview.tsx`**
- Client-side URL detection in message content
- Fetch OpenGraph metadata via main process IPC (avoids CORS)
- Render preview cards

**Modify: `frontend/src/main/index.ts`**
- Add IPC handler for fetching link metadata from URLs
- Configure `electron-updater` for auto-updates with code signing verification

**Modify: `frontend/package.json`**
- Add `electron-updater` dependency

**Add docker-compose.dev.yml:**
- MinIO container for local S3-compatible storage

### Verification
- File uploads work with encryption (encrypted blob in storage, plaintext in client)
- Presigned URLs grant time-limited access
- Link previews render for shared URLs
- Auto-updater checks for updates on launch
- Migration applies cleanly

---

## Phase 7: Signal Protocol (1:1 & Small Groups < 50)

**Goal**: Implement true end-to-end encryption using the Signal Protocol (Double Ratchet + X3DH) for 1:1 conversations and small groups. This replaces the simple symmetric encryption from Phase 5 for applicable conversations.

### Architecture

```
Client A                        Server                       Client B
   |                              |                              |
   |-- Upload prekey bundle ----->|                              |
   |                              |<--- Upload prekey bundle ----|
   |                              |                              |
   |-- Fetch B's prekeys -------->|                              |
   |<-- B's prekey bundle --------|                              |
   |                              |                              |
   |-- X3DH key agreement --------|                              |
   |-- Double Ratchet init -------|                              |
   |-- Encrypted message -------->|----> Forward encrypted ----->|
   |                              |                     X3DH + decrypt
   |                              |                     Ratchet init
```

### Changes

**Library choice: `libsignal` via Rust FFI**
- Use `libsignal-client` Rust crate compiled to native module via `napi-rs` for Electron
- For Go backend: server only stores/relays opaque blobs — no Signal library needed server-side

**Backend: Prekey Bundle Storage**

**New migration: `backend/internal/database/migrations/000003_add_signal_keys.up.sql`**
```sql
CREATE TABLE identity_keys (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    identity_key BYTEA NOT NULL,
    registration_id INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE signed_prekeys (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_id INTEGER NOT NULL,
    public_key BYTEA NOT NULL,
    signature BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, key_id)
);

CREATE TABLE one_time_prekeys (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_id INTEGER NOT NULL,
    public_key BYTEA NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(user_id, key_id)
);

CREATE TABLE signal_sessions (
    id SERIAL PRIMARY KEY,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    peer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_data BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(owner_user_id, peer_user_id)
);
```

**New file: `backend/internal/handler/keys_handler.go`**
- `POST /api/keys/bundle` — Upload identity key + signed prekey + one-time prekeys
- `GET /api/keys/bundle/:userId` — Fetch a user's prekey bundle (consumes one OTP key)
- `GET /api/keys/count` — Check remaining one-time prekeys (client replenishes when low)

**New file: `backend/internal/service/keys_service.go`**
- Prekey bundle CRUD operations
- One-time prekey consumption (mark as used, return one unused)
- Prekey count tracking

**New file: `backend/internal/models/signal_keys.go`**
- Query methods for identity_keys, signed_prekeys, one_time_prekeys tables

**Modify: `backend/internal/router/router.go`**
- Add key management routes under protected group

**Frontend: Signal Protocol Integration**

**New native module: `frontend/native/signal-bridge/`**
- Rust crate using `napi-rs` to bridge `libsignal-client` to Node.js
- Exposes: `generateIdentityKeyPair()`, `generateSignedPreKey()`, `generatePreKeys()`, `createSession()`, `encryptMessage()`, `decryptMessage()`, `processPreKeyBundle()`
- Compiled as native addon loaded via the preload script

**New file: `frontend/src/renderer/services/signalProtocol.ts`**
- TypeScript wrapper around the native Signal bridge
- `SignalProtocolManager` class:
  - `initialize(userId)` — generate identity + prekeys, upload bundle to server
  - `establishSession(recipientId)` — fetch their prekey bundle, X3DH key agreement
  - `encrypt(recipientId, plaintext)` — Double Ratchet encrypt
  - `decrypt(senderId, ciphertext)` — Double Ratchet decrypt
  - `replenishPreKeys()` — check count, upload new batch if low

**New file: `frontend/src/renderer/stores/signalStore.ts`**
- Zustand store for Signal Protocol state
- Manages session state, key material (stored in secure store from Phase 2)
- Tracks which conversations have established sessions
- Session persistence via encrypted local storage

**Modify: `frontend/src/renderer/stores/messageStore.ts`**
- For 1:1 DMs and groups < 50: use Signal Protocol encrypt/decrypt instead of simple symmetric
- Fall back to Phase 5 symmetric encryption for channels without Signal sessions
- Detect message encryption version (`{"v":2,"signal":true,"ct":"..."}`)

**New file: `frontend/src/renderer/components/chat/SafetyNumber.tsx`**
- UI for comparing safety numbers (fingerprints) between users
- QR code generation for in-person verification
- Warning banner when a contact's identity key changes

**Signal Group Sessions (Sender Keys)**
- For groups of 2-50 members, use Signal's Sender Key distribution
- Each member generates a sender key, distributes encrypted copy to all group members
- Messages encrypted once with sender key (O(1) per message instead of O(N))
- New member joins: all existing members send their sender key to the new member
- Member leaves: all remaining members generate new sender keys

### Verification
- X3DH key agreement establishes shared secret between two clients
- Double Ratchet produces unique keys per message
- Messages decryptable only by intended recipients
- Server database contains only ciphertext (verify via psql)
- Safety number comparison matches between clients
- New device enrollment triggers identity key change warning
- Sender Key distribution works for groups up to 50
- Prekey replenishment triggers when count drops below threshold
- All existing tests pass, new Signal-specific tests pass

---

## Phase 8: MLS Protocol (Large Groups & Channels, 50+ members)

**Goal**: Implement MLS (RFC 9420 / TreeKEM) for large channels and servers where Signal Protocol's per-member cost becomes prohibitive.

### Architecture

```
TreeKEM Binary Tree (8 members example):
              root
            /      \
         n1          n2
        /  \        /  \
      n3    n4    n5    n6
     / \   / \   / \   / \
    A   B C   D E   F G   H

Key update cost: O(log N) — update one path from leaf to root
Member add/remove: O(log N) — much cheaper than Signal's O(N)
```

### Changes

**Library choice: `openmls` via Rust FFI**
- Use `openmls` Rust crate compiled to native module via `napi-rs` (same pattern as Phase 7)
- Extend the existing `frontend/native/signal-bridge/` to include MLS bindings, or create separate `frontend/native/mls-bridge/`

**Backend: MLS Group State Storage**

**New migration: `backend/internal/database/migrations/000004_add_mls_groups.up.sql`**
```sql
CREATE TABLE mls_groups (
    group_id UUID PRIMARY KEY,
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    epoch BIGINT NOT NULL DEFAULT 0,
    tree_hash BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(channel_id)
);

CREATE TABLE mls_key_packages (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_package BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mls_key_packages_user_id ON mls_key_packages(user_id);

CREATE TABLE mls_welcome_messages (
    id SERIAL PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES mls_groups(group_id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    welcome_data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mls_welcome_recipient ON mls_welcome_messages(recipient_user_id);

CREATE TABLE mls_commits (
    id SERIAL PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES mls_groups(group_id) ON DELETE CASCADE,
    epoch BIGINT NOT NULL,
    commit_data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mls_commits_group_epoch ON mls_commits(group_id, epoch);
```

**New file: `backend/internal/handler/mls_handler.go`**
- `POST /api/mls/key-packages` — Upload key packages
- `GET /api/mls/key-packages/:userId` — Fetch key package for adding to group
- `POST /api/mls/groups` — Create MLS group for a channel
- `POST /api/mls/groups/:groupId/commit` — Submit commit (member add/remove/update)
- `GET /api/mls/groups/:groupId/welcome` — Fetch welcome message for new member
- `GET /api/mls/groups/:groupId/commits` — Fetch commits since epoch N

**New file: `backend/internal/service/mls_service.go`**
- MLS group lifecycle management
- Key package storage and retrieval
- Commit and welcome message relay
- Epoch tracking

**New file: `backend/internal/models/mls.go`**
- Query methods for mls_groups, mls_key_packages, mls_welcome_messages, mls_commits

**Modify: `backend/internal/router/router.go`**
- Add MLS routes under protected group

**Frontend: MLS Integration**

**New native module or extend: `frontend/native/mls-bridge/`**
- Rust crate using `napi-rs` + `openmls`
- Exposes: `createGroup()`, `addMember()`, `removeMember()`, `createCommit()`, `processCommit()`, `processWelcome()`, `encryptApplicationMessage()`, `decryptApplicationMessage()`, `generateKeyPackage()`

**New file: `frontend/src/renderer/services/mlsProtocol.ts`**
- TypeScript wrapper around MLS native bridge
- `MLSProtocolManager` class:
  - `createGroup(channelId, initialMembers)` — create MLS group, distribute welcome messages
  - `addMember(channelId, userId)` — generate Add commit + welcome
  - `removeMember(channelId, userId)` — generate Remove commit
  - `encrypt(channelId, plaintext)` — MLS application message encryption
  - `decrypt(channelId, senderId, ciphertext)` — MLS application message decryption
  - `processCommit(channelId, commitData)` — advance epoch
  - `selfUpdate(channelId)` — post-compromise recovery via Update commit

**New file: `frontend/src/renderer/stores/mlsStore.ts`**
- Zustand store for MLS group state
- Tracks group epochs, member trees, pending commits
- Persists group state in encrypted local storage

**Modify: `frontend/src/renderer/stores/messageStore.ts`**
- Protocol selection logic based on conversation size:
  - 1:1 DMs: Signal Protocol (Phase 7)
  - Groups < 50: Signal Sender Keys (Phase 7)
  - Channels/groups >= 50: MLS (this phase)
- Detect message encryption version (`{"v":3,"mls":true,"epoch":N,"ct":"..."}`)

**New WS events for MLS:**
- `MLS_COMMIT` (server -> client): broadcast commit to all group members
- `MLS_WELCOME` (server -> client): deliver welcome to newly added member
- Add to `backend/internal/ws/events.go` and `frontend/src/renderer/types/ws.ts`

**Modify: `backend/internal/ws/client.go`**
- Handle MLS event routing

### Protocol Switching Logic
```
if (conversationType === 'dm' || groupSize < 50) {
  // Use Signal Protocol (Double Ratchet / Sender Keys)
  // Phase 7 implementation
} else {
  // Use MLS (TreeKEM)
  // Phase 8 implementation
}
```

### Verification
- MLS group creation with TreeKEM tree
- Member add: O(log N) cost, new member receives welcome message
- Member remove: O(log N) cost, remaining members advance epoch
- Post-compromise recovery via self-update commit
- Messages encrypted/decrypted correctly across epoch changes
- Protocol switching between Signal and MLS works transparently
- Server stores only opaque encrypted blobs
- All existing tests pass, new MLS tests pass

---

## Dependency Graph

```
Phase 1 (Backend Hardening)
    |
    v
Phase 2 (Electron Hardening) -- secure store needed by Phase 5+
    |
    v
Phase 3 (Transport Security) -- token rotation, WSS
    |
    |---------------------------+
    v                           v
Phase 4 (WS Performance)    Phase 5 (Simple Encryption)
    |                           |
    |                           v
    |                      Phase 6 (File Uploads & Media)
    |                           |
    +-----------+---------------+
                v
         Phase 7 (Signal Protocol)
                |
                v
         Phase 8 (MLS Protocol)
```

Phases 4 and 5 can run in parallel. Phases 1-3 are sequential prerequisites. Phases 7-8 depend on all prior phases.

---

## Estimated Effort

| Phase | Scope | Est. Time |
|-------|-------|-----------|
| 1. Backend Hardening | 3 new files, 5 modified | 2-3 days |
| 2. Electron Hardening | 3 new files, 5 modified, font assets | 3-4 days |
| 3. Transport Security | 1 new file, 6 modified | 2-3 days |
| 4. WS Performance | 5 new files, 4 modified, protobuf tooling | 4-5 days |
| 5. Simple Encryption | 4 new files, 2 modified | 3-4 days |
| 6. File Uploads & Media | 7 new files, 5 modified, migration | 5-7 days |
| 7. Signal Protocol | Rust FFI crate, 6 new files, 4 modified, migration | 10-15 days |
| 8. MLS Protocol | Rust FFI crate, 5 new files, 4 modified, migration | 10-15 days |
| **Total** | | **~40-56 days** |

---

## Critical Files (Most Frequently Modified)

- `backend/internal/router/router.go` — routing, middleware, rate limiting (Phases 1, 3, 6, 7, 8)
- `backend/cmd/server/main.go` — service wiring, startup (Phases 1, 6, 7, 8)
- `backend/internal/ws/client.go` — WS pump logic, codecs, token rotation (Phases 3, 4, 8)
- `backend/internal/ws/hub.go` — broadcasting, pooling, batching (Phase 4, 8)
- `backend/internal/ws/events.go` — event types (Phases 3, 4, 8)
- `backend/internal/config/config.go` — configuration (Phases 1, 6)
- `frontend/src/main/index.ts` — Electron main process (Phases 2, 6)
- `frontend/src/renderer/stores/authStore.ts` — token management (Phase 2)
- `frontend/src/renderer/stores/messageStore.ts` — message encrypt/decrypt (Phases 5, 7, 8)
- `frontend/src/renderer/services/ws.ts` — WS client, codecs, token rotation (Phases 3, 4)
- `frontend/src/preload/index.ts` — IPC bridge (Phases 2, 6)

## Key Reusable Patterns

- **Fiber middleware pattern** (`backend/internal/auth/middleware.go`) — follow for security headers middleware
- **Service layer pattern** (`backend/internal/service/`) — follow for keys_service, mls_service, upload_service, cleanup_service
- **Handler pattern** (`backend/internal/handler/`) — follow for keys_handler, mls_handler, upload_handler
- **Testcontainers setup** (`backend/internal/testutil/testdb.go`) — reuse for all new integration tests
- **Zustand store pattern** (`frontend/src/renderer/stores/`) — follow for keyStore, signalStore, mlsStore
- **IPC bridge pattern** (`frontend/src/preload/index.ts`) — follow for secureStore, link preview, file system access
