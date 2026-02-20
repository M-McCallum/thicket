# Worktree Plan: Thicket Mobile App + DM Backend

## Overview
- **Total workstreams**: 4
- **Phases**: 3 (Phase 0 parallel, Phase 1 sequential, Phase 2 sequential)
- **Total atomic commits**: 51 across all worktrees
- **Estimated parallel speedup**: ~1.3x (DM backend runs free alongside mobile foundation)

### Dependency Graph

```
Time →

Phase 0 (parallel):
  foundation (12 commits)  ─────────────────────┐
  dm-backend (5 commits)  ──────┐               │
                                │               │
Phase 1 (after foundation):     │               │
  mobile-core (22 commits)      │  ─────────────┼──────────────────────┐
                                │               │                      │
Phase 2 (after dm-backend       │               │                      │
         + mobile-core):        │               │                      │
  mobile-integration (12 commits)┘──────────────┘──────────────────────┘
```

### Why 4 Worktrees?

The mobile app phases (1-7) form a deeply sequential chain — each phase modifies or replaces files created by the previous one (`App.tsx`, placeholder screens, navigation files). Splitting mobile into parallel streams creates unavoidable file conflicts. The **only** true parallelism is running the DM backend (which touches `backend/` and `frontend/`) alongside the mobile foundation (which touches `mobile/` and `Makefile`).

---

## File Ownership Map

| Worktree | Owned Files/Directories |
|----------|------------------------|
| `foundation` | `mobile/` (creation + scaffold), `mobile/App.tsx`, `mobile/app.json`, `mobile/package.json`, `mobile/tsconfig.json`, `mobile/babel.config.js`, `mobile/tailwind.config.js`, `mobile/global.css`, `mobile/metro.config.js`, `mobile/jest.config.ts`, `mobile/jest-setup.ts`, `mobile/src/config.ts`, `mobile/src/types/`, `mobile/src/services/`, `mobile/src/stores/{auth,server,message}Store.ts`, `mobile/assets/fonts/`, `mobile/src/hooks/useLoadFonts.ts`, `mobile/src/components/ui/`, `Makefile` |
| `dm-backend` | `backend/internal/service/dm_service.go`, `backend/internal/service/dm_service_test.go`, `backend/internal/handler/dm_handler.go`, `backend/internal/handler/dm_handler_test.go`, `backend/internal/router/router.go`, `backend/cmd/server/main.go`, `backend/internal/ws/events.go`, `frontend/src/renderer/services/api.ts`, `frontend/src/renderer/types/ws.ts` |
| `mobile-core` | `mobile/src/navigation/`, `mobile/src/screens/`, `mobile/src/components/chat/`, `mobile/src/hooks/{useAppInit,useWebSocketEvents,useAppLifecycle,useNetworkStatus}.ts`, modifies `mobile/App.tsx` |
| `mobile-integration` | `mobile/src/stores/dmStore.ts`, `mobile/src/screens/dms/` (replaces placeholders), `mobile/src/components/{ErrorBoundary,ErrorFallback}.tsx`, `mobile/src/components/ui/Toast.tsx`, `mobile/src/hooks/useToast.ts`, `mobile/src/__tests__/`, `mobile/eas.json`, `mobile/README.md`, modifies `mobile/src/services/api.ts`, `mobile/src/hooks/useWebSocketEvents.ts`, `mobile/App.tsx`, `mobile/app.json`, `mobile/src/navigation/`, `mobile/src/components/ui/GlowBorder.tsx` |

---

## Phase 0: Parallel Start
> Both worktrees start immediately and run concurrently. Zero file overlap.

### Worktree: `foundation`
- **Branch**: `feat/mobile-foundation`
- **Purpose**: Scaffold the Expo project, install all dependencies, configure NativeWind + Jest, port shared types/services/stores from the Electron frontend, create base UI component library, and add Makefile targets.
- **Commit sequence**:

| # | Commit message | Files | Verify |
|---|---------------|-------|--------|
| 1 | `chore(mobile): initialize Expo project with blank TypeScript template` | `mobile/App.tsx`, `mobile/app.json`, `mobile/package.json`, `mobile/tsconfig.json` | `cd mobile && npx expo start` launches Metro |
| 2 | `chore(mobile): install core dependencies` | `mobile/package.json`, `mobile/package-lock.json` | `npx expo start` works; `npx jest --passWithNoTests` exits 0 |
| 3 | `feat(mobile): configure NativeWind v4 with shared cyberpunk theme` | `mobile/tailwind.config.js`, `mobile/babel.config.js`, `mobile/global.css`, `mobile/metro.config.js` | NativeWind classes render on simulator |
| 4 | `chore(mobile): configure Jest, TypeScript strict mode, and path aliases` | `mobile/jest.config.ts`, `mobile/jest-setup.ts`, `mobile/tsconfig.json`, `mobile/babel.config.js` | `npx jest --passWithNoTests` passes; `npx tsc --noEmit` passes |
| 5 | `feat(mobile): copy shared types from Electron frontend with DM event types` | `mobile/src/types/models.ts`, `mobile/src/types/api.ts`, `mobile/src/types/ws.ts` | `npx tsc --noEmit` passes |
| 6 | `feat(mobile): port API service with configurable base URL and DM namespace` | `mobile/src/config.ts`, `mobile/src/services/api.ts`, `mobile/src/services/__tests__/api.test.ts` | API service tests pass |
| 7 | `feat(mobile): port WebSocket service and Zustand stores` | `mobile/src/services/ws.ts`, `mobile/src/stores/authStore.ts`, `mobile/src/stores/serverStore.ts`, `mobile/src/stores/messageStore.ts`, `mobile/src/services/__tests__/ws.test.ts`, `mobile/src/stores/__tests__/*.test.ts` | All store + service tests pass |
| 8 | `chore: add mobile Makefile targets` | `Makefile` | `make test-mobile` and `make lint-mobile` pass |
| 9 | `feat(mobile): load custom cyberpunk fonts` | `mobile/assets/fonts/*`, `mobile/src/hooks/useLoadFonts.ts` | Fonts render on simulator |
| 10 | `feat(mobile): create CyberText, Input, and Button components` | `mobile/src/components/ui/CyberText.tsx`, `mobile/src/components/ui/Input.tsx`, `mobile/src/components/ui/Button.tsx`, tests | Component tests pass |
| 11 | `feat(mobile): create Avatar, Modal, and LoadingScreen components` | `mobile/src/components/ui/Avatar.tsx`, `mobile/src/components/ui/Modal.tsx`, `mobile/src/components/ui/LoadingScreen.tsx`, tests | Component tests pass |
| 12 | `feat(mobile): create Divider, OfflineBanner, GlowBorder, and barrel export` | `mobile/src/components/ui/Divider.tsx`, `mobile/src/components/ui/OfflineBanner.tsx`, `mobile/src/components/ui/GlowBorder.tsx`, `mobile/src/components/ui/index.ts` | Build passes |

- **Done when**: `make test-mobile` passes, `npx tsc --noEmit` passes, UI components render correctly on simulator
- **Claude Code prompt**:

> You are working on the Thicket project (a cyberpunk Discord clone) in a git worktree dedicated to scaffolding the React Native mobile app and creating the base UI component library.
>
> ## Context
> Thicket has a Go backend (Fiber v3 + PostgreSQL) and an Electron desktop frontend (React 19 + Zustand + Tailwind). You are adding a React Native mobile app in a new `mobile/` directory. Many types, services, and stores can be copied/adapted from the Electron frontend at `frontend/src/renderer/`.
>
> ## Your Goal
> 1. Initialize the Expo project with all dependencies
> 2. Configure NativeWind v4 (Tailwind for RN) sharing the cyberpunk theme from `frontend/tailwind.config.js`
> 3. Configure Jest + TypeScript
> 4. Port shared types, API service, WebSocket service, and Zustand stores from the Electron frontend
> 5. Add mobile Makefile targets
> 6. Load custom fonts (Orbitron, Inter, Share Tech Mono)
> 7. Create base UI component library with cyberpunk styling
>
> ## Key Reference Files
> - `frontend/tailwind.config.js` — cyberpunk theme tokens (colors, fonts, shadows, animations)
> - `frontend/src/renderer/types/{models,api,ws}.ts` — shared TypeScript types
> - `frontend/src/renderer/services/api.ts` — API client with token refresh
> - `frontend/src/renderer/services/ws.ts` — WebSocket client
> - `frontend/src/renderer/stores/{authStore,serverStore,messageStore}.ts` — Zustand stores
>
> ## Code Reuse Strategy
> - Types: copy verbatim, add DM WS event types (`DM_MESSAGE_CREATE`, `DM_MESSAGE_UPDATE`, `DM_MESSAGE_DELETE`)
> - Stores: copy serverStore and messageStore verbatim; authStore replaces localStorage with expo-secure-store (async)
> - API service: ~95% identical, swap hardcoded URL for configurable constant from `config.ts`
> - WS service: ~90% identical, add AppState awareness and configurable URL
> - UI components: full rewrite using RN primitives with NativeWind classes
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
> ### Commit 1: `chore(mobile): initialize Expo project with blank TypeScript template`
> - Run `npx create-expo-app@latest mobile --template blank-typescript` from the repo root
> - Verify: `cd mobile && npx expo start` launches Metro bundler
>
> ### Commit 2: `chore(mobile): install core dependencies`
> - Navigation: `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`, `@react-navigation/drawer`
> - RN essentials: `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`, `react-native-reanimated`
> - State/storage: `zustand`, `expo-secure-store`, `@react-native-async-storage/async-storage`
> - NativeWind: `nativewind`, `tailwindcss`
> - Fonts/platform: `expo-font`, `expo-splash-screen`, `expo-status-bar`, `expo-constants`, `expo-clipboard`, `expo-haptics`
> - Dev: `@testing-library/react-native`, `jest-expo`, `@types/react`
> - Verify: `npx expo start` still works; `npx jest --passWithNoTests` exits 0
>
> ### Commit 3: `feat(mobile): configure NativeWind v4 with shared cyberpunk theme`
> - Create `mobile/tailwind.config.js` importing theme tokens from `frontend/tailwind.config.js` (cyberpunk colors, fonts, shadows, animations)
> - Configure `babel.config.js` with `nativewind/babel` preset
> - Create `mobile/global.css` with `@tailwind` directives
> - Configure Metro to use NativeWind's CSS transformer
> - Verify: `className="bg-cyber-bg text-neon-cyan"` renders correct colors
>
> ### Commit 4: `chore(mobile): configure Jest, TypeScript strict mode, and path aliases`
> - `mobile/jest.config.ts` with `jest-expo` preset, NativeWind mocks
> - `mobile/jest-setup.ts` mocking SecureStore, AsyncStorage, NativeWind
> - `tsconfig.json` paths: `@/* -> ./src/*`, strict mode
> - `babel.config.js` with `module-resolver` for `@/` alias and `reanimated` plugin
> - Verify: `npx jest --passWithNoTests` passes; `npx tsc --noEmit` passes
>
> ### Commit 5: `feat(mobile): copy shared types from Electron frontend with DM event types`
> - Copy `frontend/src/renderer/types/{models,api,ws}.ts` to `mobile/src/types/`
> - Add DM-specific WS event types to `ws.ts`: `DM_MESSAGE_CREATE`, `DM_MESSAGE_UPDATE`, `DM_MESSAGE_DELETE`
> - Verify: `npx tsc --noEmit` passes
>
> ### Commit 6: `feat(mobile): port API service with configurable base URL and DM namespace`
> - Create `mobile/src/config.ts` exporting `API_BASE_URL` and `WS_BASE_URL` using `__DEV__` flag
> - Port `mobile/src/services/api.ts` from `frontend/src/renderer/services/api.ts`, swap hardcoded URL; add DM API namespace stub (methods for Phase 9)
> - Write `mobile/src/services/__tests__/api.test.ts`
> - Verify: API service tests pass
>
> ### Commit 7: `feat(mobile): port WebSocket service and Zustand stores`
> - Port `mobile/src/services/ws.ts` from `frontend/src/renderer/services/ws.ts`, add `AppState` listener, configurable URL
> - Port `mobile/src/stores/authStore.ts` — replace `localStorage` with `SecureStore` (async)
> - Copy `mobile/src/stores/serverStore.ts` verbatim
> - Copy `mobile/src/stores/messageStore.ts` verbatim
> - Port tests from Vitest to Jest for all stores + WS service
> - Verify: All store + service tests pass
>
> ### Commit 8: `chore: add mobile Makefile targets`
> - Add `dev-mobile`, `test-mobile`, `lint-mobile` to root `Makefile`
> - Update `test` target to include `test-mobile`
> - Verify: `make test-mobile` passes
>
> ### Commit 9: `feat(mobile): load custom cyberpunk fonts`
> - Add font files to `mobile/assets/fonts/` (Orbitron, Inter, Share Tech Mono)
> - Create `mobile/src/hooks/useLoadFonts.ts` using `expo-font` `useFonts` hook
> - Verify: Fonts render correctly on simulator
>
> ### Commit 10: `feat(mobile): create CyberText, Input, and Button components`
> - `CyberText.tsx` — variants: display (Orbitron), body (Inter), mono (Share Tech Mono), label (uppercase mono)
> - `Input.tsx` — NativeWind classes: `bg-cyber-bg border border-cyber-text-muted/30 focus:border-neon-cyan`
> - `Button.tsx` — variants: primary (cyan glow), danger (red), ghost; props: loading, disabled
> - Tests for each component
> - Verify: Component tests pass
>
> ### Commit 11: `feat(mobile): create Avatar, Modal, and LoadingScreen components`
> - `Avatar.tsx` — circular initial letter with status indicator dot
> - `Modal.tsx` — dark overlay (`bg-black/60`)
> - `LoadingScreen.tsx` — pulsing "THICKET" text on `bg-cyber-bg`
> - Tests for each
> - Verify: Tests pass
>
> ### Commit 12: `feat(mobile): create Divider, OfflineBanner, GlowBorder, and barrel export`
> - `Divider.tsx` — neon accent line
> - `OfflineBanner.tsx` — network status banner
> - `GlowBorder.tsx` — wrapper with neon glow shadow
> - `mobile/src/components/ui/index.ts` barrel export
> - Verify: Build passes
>
> ## Boundaries
> - ONLY modify files in: `mobile/`, `Makefile`
> - Do NOT touch: `backend/`, `frontend/` (except reading for reference)
>
> ## Done When
> - [ ] All 12 commits above are made in order
> - [ ] `make test-mobile` passes
> - [ ] `npx tsc --noEmit` passes in `mobile/`
> - [ ] UI components render correctly on simulator
> - [ ] `git log --oneline` shows clean, atomic history

---

### Worktree: `dm-backend`
- **Branch**: `feat/dm-backend`
- **Purpose**: Complete the DM backend (tests for existing service, HTTP handler, route registration, WebSocket events) and add DM API methods to the Electron frontend service.
- **Depends on**: Nothing (starts immediately)
- **Current state**: `dm_service.go` already exists (untracked) with full implementation (CreateConversation, SendDM, GetConversations, GetDMMessages, GetParticipantIDs). `dm_service_test.go` already exists with 17 tests covering creation, dedup, self-DM, send, sanitization, pagination, etc. `dm.go` model queries are complete. Missing: DeleteMessage method + query, handler, routes, WS events, frontend API methods.
- **Commit sequence**:

| # | Commit message | Files | Verify |
|---|---------------|-------|--------|
| 1 | `feat(dm): add DeleteMessage to DM service with tests` | `backend/internal/service/dm_service.go` (add DeleteMessage), `backend/internal/models/dm.go` (add DeleteDMMessage query), `backend/internal/service/dm_service_test.go` (add delete tests) | `make test-backend` passes |
| 2 | `feat(dm): implement DM HTTP handler` | `backend/internal/handler/dm_handler.go`, `backend/internal/handler/dm_handler_test.go` | Handler tests pass |
| 3 | `feat(dm): register DM routes under auth middleware` | `backend/internal/router/router.go`, `backend/cmd/server/main.go` | Server starts; DM endpoints respond |
| 4 | `feat(dm): add DM WebSocket events and broadcasting` | `backend/internal/ws/events.go` | `make test-backend` passes |
| 5 | `feat(dm): add DM API methods to Electron frontend service` | `frontend/src/renderer/services/api.ts`, `frontend/src/renderer/types/ws.ts` | `make test-frontend` passes; types compile |

- **Done when**: `make test-backend` passes, DM endpoints work via curl, `make test-frontend` passes
- **Claude Code prompt**:

> You are working on the Thicket project (a cyberpunk Discord clone) in a git worktree dedicated to implementing the DM (Direct Message) backend and adding DM API methods to the Electron frontend.
>
> ## Context
> Thicket has a Go backend (Fiber v3 + PostgreSQL) with REST API + WebSocket. The DM database schema and model queries already exist in `backend/internal/models/dm.go`. A DM service (`backend/internal/service/dm_service.go`) already exists with CreateConversation, SendDM, GetConversations, GetDMMessages, and GetParticipantIDs — but it has NO tests and is missing DeleteMessage.
>
> ## Your Goal
> 1. Add DeleteMessage to the DM service + write comprehensive TDD-style tests using testcontainers
> 2. Create DM HTTP handler with 5 endpoints
> 3. Register DM routes in the router under auth middleware
> 4. Add DM WebSocket event types and broadcasting to conversation participants
> 5. Add DM API methods to the Electron frontend's API service
>
> ## Key Reference Files
> - `backend/internal/models/dm.go` — DM query methods (CreateDMConversation, AddDMParticipant, GetDMParticipant, GetUserDMConversations, GetDMParticipants, CreateDMMessage, GetDMMessages, GetDMConversationByID, FindExistingDMConversation)
> - `backend/internal/service/dm_service.go` — existing DM service (ALREADY IMPLEMENTED, needs tests + DeleteMessage)
> - `backend/internal/handler/message_handler.go` — reference for handler patterns (HTTP handler style)
> - `backend/internal/router/router.go` — current route registration (add DM routes here)
> - `backend/cmd/server/main.go` — wire DM service + handler here
> - `backend/internal/ws/events.go` — current WS event types (add DM events)
> - `backend/internal/ws/hub.go` — Hub with BroadcastToChannel and SendToUser methods
> - `frontend/src/renderer/services/api.ts` — Electron API client (add DM methods)
> - `frontend/src/renderer/types/ws.ts` — WS event types (add DM events)
> - `backend/internal/service/message_service.go` — reference for service patterns
> - `backend/internal/testutil/` — test helpers with testcontainers
>
> ## DM API Endpoints
> - `POST /api/dms` — create conversation (body: `{participant_id: string}`)
> - `GET /api/dms` — list user's conversations (with participant info)
> - `GET /api/dms/:id/messages` — get messages (query: `before`, `limit`)
> - `POST /api/dms/:id/messages` — send message (body: `{content}`)
> - `DELETE /api/dm-messages/:id` — delete message (author only)
>
> ## DM WebSocket Events
> - `DM_MESSAGE_CREATE` — broadcast to all conversation participants
> - `DM_MESSAGE_DELETE` — broadcast to all conversation participants
> - Use `dm:{conversationID}` as the channel key for Hub.BroadcastToChannel
> - DM handler should publish WS events after successful create/delete
>
> ## Commit Discipline — IMPORTANT
> You MUST make one atomic commit per task below. Follow these rules strictly:
> - Complete each task fully before committing (code + tests for that task)
> - Verify the build passes and relevant tests pass BEFORE each commit
> - Use the exact commit messages provided below
> - NEVER combine multiple tasks into one commit
> - NEVER leave a commit in a broken state
>
> After each commit, run the verification step listed. If it fails, fix it within the same commit (amend).
>
> ## Commit Sequence
>
> ### Commit 1: `feat(dm): add DeleteMessage to DM service with tests`
> - Add a `DeleteDMMessage` query method to `backend/internal/models/dm.go` (get message by ID, delete by ID)
> - Add `DeleteMessage(ctx, messageID, authorID)` to `dm_service.go` — verify author owns message, then delete
> - `dm_service_test.go` already has 17 tests for existing methods. ADD tests for DeleteMessage: success, wrong author (forbidden), message not found
> - Verify: `make test-backend` passes
>
> ### Commit 2: `feat(dm): implement DM HTTP handler`
> - Create `backend/internal/handler/dm_handler.go` following existing handler patterns
> - Endpoints: POST /dms, GET /dms, GET /dms/:id/messages, POST /dms/:id/messages, DELETE /dm-messages/:id
> - Parse auth user ID from fiber context (same pattern as other handlers)
> - Create `backend/internal/handler/dm_handler_test.go`
> - Verify: Handler tests pass
>
> ### Commit 3: `feat(dm): register DM routes under auth middleware`
> - Add `DMHandler *handler.DMHandler` to `router.Config` struct in `router.go`
> - Register DM routes under the `protected` group
> - Wire up DMService + DMHandler in `main.go`: create service, create handler, pass to router config
> - Verify: Server starts; DM endpoints respond correctly
>
> ### Commit 4: `feat(dm): add DM WebSocket events and broadcasting`
> - Add constants to `events.go`: `EventDMMessageCreate = "DM_MESSAGE_CREATE"`, `EventDMMessageDelete = "DM_MESSAGE_DELETE"`
> - Update DM handler to accept Hub, broadcast events after message create/delete
> - Use `dm:{conversationID}` as channel key
> - Auto-subscribe conversation participants to their DM channels (subscribe in handler when listing conversations, or on WS identify)
> - Verify: `make test-backend` passes
>
> ### Commit 5: `feat(dm): add DM API methods to Electron frontend service`
> - Add DM methods to `frontend/src/renderer/services/api.ts`:
>   ```typescript
>   export const dms = {
>     list: () => request<DMConversation[]>('/dms'),
>     create: (participantId: string) => request<DMConversation>('/dms', { method: 'POST', body: JSON.stringify({ participant_id: participantId }) }),
>     messages: {
>       list: (id: string, before?: string, limit?: number) => { /* with query params */ },
>       send: (id: string, content: string) => request<DMMessage>(`/dms/${id}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),
>       delete: (messageId: string) => request<{ message: string }>(`/dm-messages/${messageId}`, { method: 'DELETE' })
>     }
>   }
>   ```
> - Add DM WS event types to `frontend/src/renderer/types/ws.ts`: `DM_MESSAGE_CREATE`, `DM_MESSAGE_DELETE`
> - Verify: `make test-frontend` passes; TypeScript compiles
>
> ## Boundaries
> - ONLY modify files in: `backend/internal/service/dm_service*.go`, `backend/internal/handler/dm_handler*.go`, `backend/internal/router/router.go`, `backend/cmd/server/main.go`, `backend/internal/ws/events.go`, `backend/internal/models/dm.go` (add DeleteDMMessage query), `frontend/src/renderer/services/api.ts`, `frontend/src/renderer/types/ws.ts`
> - Do NOT touch: `mobile/`, `Makefile`, any other frontend or backend files unless absolutely necessary
>
> ## Done When
> - [ ] All 5 commits made in order
> - [ ] `make test-backend` passes
> - [ ] `make test-frontend` passes
> - [ ] DM endpoints work via curl against running server
> - [ ] `git log --oneline` shows clean, atomic history

---

## Phase 1: Mobile Core
> Starts after `foundation` completes. Runs concurrently with `dm-backend` if it's still in progress.

### Worktree: `mobile-core`
- **Branch**: `feat/mobile-core`
- **Purpose**: Build the full mobile navigation tree, auth screens, server list, chat functionality, real-time WebSocket events, server management, and profile screen.
- **Depends on**: Phase 0 (`foundation` must be merged first)
- **Commit sequence**:

| # | Commit message | Files | Verify |
|---|---------------|-------|--------|
| 1 | `feat(mobile): create root navigator with auth/main split` | `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/navigation/types.ts`, `mobile/App.tsx` | App shows loading → auth screen |
| 2 | `feat(mobile): implement LoginScreen with cyberpunk styling` | `mobile/src/screens/auth/LoginScreen.tsx`, `mobile/src/screens/auth/__tests__/LoginScreen.test.tsx` | Login screen tests pass |
| 3 | `feat(mobile): add app initialization with secure storage token restore` | `mobile/src/hooks/useAppInit.ts`, `mobile/src/hooks/__tests__/useAppInit.test.ts` | Hook tests pass |
| 4 | `feat(mobile): create auth stack navigator` | `mobile/src/navigation/AuthStack.tsx` | Full auth flow works |
| 5 | `feat(mobile): create MainTabs bottom tab navigator` | `mobile/src/navigation/MainTabs.tsx` | Tabs render and switch |
| 6 | `feat(mobile): implement ServersScreen with server list` | `mobile/src/screens/servers/ServersScreen.tsx`, tests | Server list tests pass |
| 7 | `feat(mobile): create server and join server modals` | `mobile/src/screens/servers/CreateServerModal.tsx`, `mobile/src/screens/servers/JoinServerModal.tsx`, tests | Modal tests pass |
| 8 | `feat(mobile): add chat tab with drawer navigator` | `mobile/src/navigation/ChatDrawer.tsx` | Swipe opens channel list |
| 9 | `feat(mobile): implement ChannelDrawerContent` | `mobile/src/components/chat/ChannelDrawerContent.tsx`, tests | Drawer content tests pass |
| 10 | `feat(mobile): add placeholder screens for chat, profile, and DMs` | `mobile/src/screens/chat/ChatScreen.tsx`, `mobile/src/screens/profile/ProfileScreen.tsx`, `mobile/src/screens/dms/DMListScreen.tsx` | Full nav flow works end-to-end |
| 11 | `feat(mobile): implement MessageItem component` | `mobile/src/components/chat/MessageItem.tsx`, tests | Component tests pass |
| 12 | `feat(mobile): implement full ChatScreen with message list` | `mobile/src/screens/chat/ChatScreen.tsx` (replace placeholder), tests | Chat screen tests pass |
| 13 | `feat(mobile): implement MessageInput with keyboard avoidance` | `mobile/src/components/chat/MessageInput.tsx`, tests | Input tests pass |
| 14 | `feat(mobile): add message pagination with infinite scroll` | `mobile/src/screens/chat/ChatScreen.tsx` (modify) | Scrolling up loads older messages |
| 15 | `feat(mobile): implement MemberListSheet bottom sheet` | `mobile/src/components/chat/MemberListSheet.tsx`, tests | Member list tests pass |
| 16 | `feat(mobile): set up global WebSocket event handlers` | `mobile/src/hooks/useWebSocketEvents.ts`, tests | Hook tests pass |
| 17 | `feat(mobile): add typing indicators` | `mobile/src/components/chat/TypingIndicator.tsx`, modifies `mobile/src/components/chat/MessageInput.tsx` (adds debounced typing), tests | Typing indicator tests pass |
| 18 | `feat(mobile): add app lifecycle management for WS reconnect` | `mobile/src/hooks/useAppLifecycle.ts`, tests | Lifecycle hook tests pass |
| 19 | `feat(mobile): add network connectivity handling with offline banner` | `mobile/src/hooks/useNetworkStatus.ts` | Offline banner appears when disconnected |
| 20 | `feat(mobile): implement server action sheet` | `mobile/src/screens/servers/ServerActionsSheet.tsx`, tests | Action sheet tests pass |
| 21 | `feat(mobile): implement full ProfileScreen with status picker` | `mobile/src/screens/profile/ProfileScreen.tsx` (replace placeholder), tests | Profile tests pass |
| 22 | `feat(mobile): add channel creation modal` | `mobile/src/components/chat/CreateChannelModal.tsx`, modifies `mobile/src/components/chat/ChannelDrawerContent.tsx`, tests | Channel creation tests pass |

- **Done when**: Full server/channel/chat flow works end-to-end, all tests pass, `make test-mobile` passes
- **Claude Code prompt**:

> You are working on the Thicket project (a cyberpunk Discord clone) in a git worktree dedicated to building the mobile app's navigation, authentication, chat, real-time features, and server management.
>
> ## Context
> The mobile Expo project has already been scaffolded with NativeWind, shared types/services/stores, and base UI components (in the `foundation` branch, now merged). You are building on top of that foundation.
>
> ## Your Goal
> Build the complete mobile app experience (except DMs and final polish):
> 1. Navigation tree (React Navigation): auth stack, bottom tabs, chat drawer
> 2. Login/signup screen with secure token storage
> 3. Server list, create/join server modals
> 4. Full chat with real-time messages, pagination, member list
> 5. WebSocket event handling for all event types
> 6. Typing indicators, app lifecycle management, network status
> 7. Server management (actions sheet, leave/delete), profile screen, channel creation
>
> ## Key Reference Files (from Electron frontend — adapt these)
> - `frontend/src/renderer/components/chat/ChatArea.tsx` — most complex component, port to ChatScreen
> - `frontend/src/renderer/components/server/MemberList.tsx` — role colors and status dots
> - `frontend/src/renderer/components/auth/LoginForm.tsx` — login/signup logic
> - `frontend/src/renderer/components/chat/MessageItem.tsx` — message display
> - `frontend/src/renderer/components/chat/MessageInput.tsx` — message input
>
> ## Mobile UI Layout
> ```
> Bottom Tabs: Servers | DMs | Chat | Profile
> Chat tab uses Drawer (left = channels, main = messages)
> MemberList via header button -> bottom sheet
> DMs tab has placeholder "DMs coming soon" (implemented in separate worktree)
> ```
>
> ## Already Available (from foundation)
> - Zustand stores: authStore, serverStore, messageStore (in `mobile/src/stores/`)
> - API service: `mobile/src/services/api.ts`
> - WS service: `mobile/src/services/ws.ts`
> - UI components: CyberText, Input, Button, Avatar, Modal, LoadingScreen, Divider, OfflineBanner, GlowBorder (in `mobile/src/components/ui/`)
> - Config: `mobile/src/config.ts` with API_BASE_URL, WS_BASE_URL
> - Types: `mobile/src/types/` (models, api, ws)
>
> ## Commit Discipline — IMPORTANT
> You MUST make one atomic commit per task below. Follow these rules strictly:
> - Complete each task fully before committing (code + tests for that task)
> - Verify the build passes and relevant tests pass BEFORE each commit
> - Use the exact commit messages provided below
> - NEVER combine multiple tasks into one commit
> - NEVER leave a commit in a broken state
>
> After each commit, run the verification step listed. If it fails, fix it within the same commit (amend).
>
> ## Commit Sequence
>
> ### Commit 1: `feat(mobile): create root navigator with auth/main split`
> - `mobile/src/navigation/RootNavigator.tsx` — stack: AuthStack vs MainTabs based on auth state
> - `mobile/src/navigation/types.ts` — navigation param types
> - Update `App.tsx` with `NavigationContainer`, `SafeAreaProvider`, font loading, dark theme
> - Verify: App shows loading screen then auth screen
>
> ### Commit 2: `feat(mobile): implement LoginScreen with cyberpunk styling`
> - `mobile/src/screens/auth/LoginScreen.tsx` — port of LoginForm.tsx
> - Same logic: `isSignup` toggle, form validation, `useAuthStore()` integration
> - Mobile additions: `KeyboardAvoidingView`, `ScrollView`, `secureTextEntry`
> - NativeWind classes matching the Electron cyberpunk styles
> - Write tests
> - Verify: Login screen tests pass
>
> ### Commit 3: `feat(mobile): add app initialization with secure storage token restore`
> - `mobile/src/hooks/useAppInit.ts` — reads tokens from SecureStore, restores auth state
> - Returns `{ initialized: boolean }` for loading screen
> - Write tests
> - Verify: Hook tests pass
>
> ### Commit 4: `feat(mobile): create auth stack navigator`
> - `mobile/src/navigation/AuthStack.tsx` — contains LoginScreen
> - Wire into RootNavigator
> - Verify: Full auth flow — login persists across app restart
>
> ### Commit 5: `feat(mobile): create MainTabs bottom tab navigator`
> - `mobile/src/navigation/MainTabs.tsx` — 4 tabs: Servers, DMs (placeholder), Chat, Profile
> - Tab bar: `bg-cyber-bg-secondary`, `text-neon-cyan` active, `text-cyber-text-muted` inactive
> - Verify: Tabs render and switch
>
> ### Commit 6: `feat(mobile): implement ServersScreen with server list`
> - `mobile/src/screens/servers/ServersScreen.tsx` — FlatList of server cards (icon + name)
> - Tapping sets active server and navigates to Chat tab
> - `fetchServers()` on mount; pull-to-refresh
> - Create/Join buttons in header
> - Write tests
> - Verify: Tests pass
>
> ### Commit 7: `feat(mobile): create server and join server modals`
> - `mobile/src/screens/servers/CreateServerModal.tsx` — name input, create action
> - `mobile/src/screens/servers/JoinServerModal.tsx` — invite code input, join action
> - Write tests for both
> - Verify: Tests pass
>
> ### Commit 8: `feat(mobile): add chat tab with drawer navigator`
> - `mobile/src/navigation/ChatDrawer.tsx` — left drawer = channel list, main = chat
> - Drawer width 280px, `bg-cyber-bg-secondary`, swipe from left edge
> - Verify: Swipe opens channel list
>
> ### Commit 9: `feat(mobile): implement ChannelDrawerContent`
> - `mobile/src/components/chat/ChannelDrawerContent.tsx` — port of ChannelSidebar.tsx
> - Text/voice channels grouped, `#` prefix, active highlighted `text-neon-cyan`
> - Server name header, tappable invite code (copies via expo-clipboard)
> - Write tests
> - Verify: Tests pass
>
> ### Commit 10: `feat(mobile): add placeholder screens for chat, profile, and DMs`
> - `mobile/src/screens/chat/ChatScreen.tsx` — placeholder with channel name
> - `mobile/src/screens/profile/ProfileScreen.tsx` — user info + logout button
> - `mobile/src/screens/dms/DMListScreen.tsx` — placeholder "DMs coming soon"
> - Verify: Full nav flow works end-to-end
>
> ### Commit 11: `feat(mobile): implement MessageItem component`
> - `mobile/src/components/chat/MessageItem.tsx` — port of MessageItem.tsx
> - Avatar, author name (`text-neon-cyan` if own), timestamp, content, "(edited)" indicator
> - Write tests
> - Verify: Tests pass
>
> ### Commit 12: `feat(mobile): implement full ChatScreen with message list`
> - Replace placeholder with full implementation (port of ChatArea.tsx)
> - `FlatList` with `inverted={true}` for bottom-to-top ordering
> - `useEffect` on `activeChannelId`: clear messages, fetch, subscribe WS channel
> - Listen for `MESSAGE_CREATE` WS events, add to store
> - Channel header with drawer toggle and member list button
> - Empty states for no server/channel selected
> - Write tests
> - Verify: Tests pass
>
> ### Commit 13: `feat(mobile): implement MessageInput with keyboard avoidance`
> - `mobile/src/components/chat/MessageInput.tsx` — text input + send button
> - `KeyboardAvoidingView` (iOS padding, Android height)
> - Clears input and dismisses keyboard on send
> - Write tests
> - Verify: Tests pass
>
> ### Commit 14: `feat(mobile): add message pagination with infinite scroll`
> - `onEndReached` on inverted FlatList triggers `fetchMessages` with `before` cursor
> - Loading indicator at list end; respects `hasMore` flag
> - Verify: Scrolling up loads older messages
>
> ### Commit 15: `feat(mobile): implement MemberListSheet bottom sheet`
> - `mobile/src/components/chat/MemberListSheet.tsx` — port of MemberList.tsx
> - Bottom sheet with online/offline groups, role colors (owner=`text-neon-cyan`, admin=`text-neon-magenta`)
> - Status dots: online=`bg-neon-green`, idle=yellow, dnd=`bg-neon-red`, offline=`bg-cyber-text-muted`
> - Write tests
> - Verify: Tests pass
>
> ### Commit 16: `feat(mobile): set up global WebSocket event handlers`
> - `mobile/src/hooks/useWebSocketEvents.ts` — sets up all WS listeners:
>   - MESSAGE_CREATE/UPDATE/DELETE → messageStore
>   - CHANNEL_CREATE/UPDATE/DELETE → serverStore
>   - MEMBER_JOIN/LEAVE → serverStore
>   - PRESENCE_UPDATE → update member status
> - Write tests
> - Verify: Tests pass
>
> ### Commit 17: `feat(mobile): add typing indicators`
> - `mobile/src/components/chat/TypingIndicator.tsx` — "User is typing..." with animated dots
> - Listens to `TYPING_START` events, clears after 5s
> - Modify MessageInput to send debounced `TYPING_START` on text change
> - Write tests
> - Verify: Tests pass
>
> ### Commit 18: `feat(mobile): add app lifecycle management for WS reconnect`
> - `mobile/src/hooks/useAppLifecycle.ts` — AppState listener
> - Background: pause WS heartbeat
> - Foreground: reconnect WS if needed, re-fetch active channel
> - Write tests
> - Verify: Tests pass
>
> ### Commit 19: `feat(mobile): add network connectivity handling with offline banner`
> - `mobile/src/hooks/useNetworkStatus.ts` — uses `@react-native-community/netinfo`
> - Wire OfflineBanner component (from Phase 2)
> - WS reconnect on restore; disable send when offline
> - Verify: Offline banner appears when disconnected
>
> ### Commit 20: `feat(mobile): implement server action sheet`
> - `mobile/src/screens/servers/ServerActionsSheet.tsx` — long-press on server card
> - Copy invite code, leave server, delete server (owner only with confirmation)
> - Write tests
> - Verify: Tests pass
>
> ### Commit 21: `feat(mobile): implement full ProfileScreen with status picker`
> - Replace placeholder with full implementation
> - User info card, status picker (online/idle/dnd/offline → PRESENCE_UPDATE), logout, app version
> - Write tests
> - Verify: Tests pass
>
> ### Commit 22: `feat(mobile): add channel creation modal`
> - `mobile/src/components/chat/CreateChannelModal.tsx` — name + text/voice type selector
> - Add "+" button to ChannelDrawerContent to open the modal
> - Write tests
> - Verify: Tests pass
>
> ## Boundaries
> - ONLY modify files in: `mobile/src/navigation/`, `mobile/src/screens/`, `mobile/src/components/chat/`, `mobile/src/hooks/`, `mobile/App.tsx`
> - Do NOT touch: `backend/`, `frontend/`, `mobile/src/stores/` (except imports), `mobile/src/components/ui/` (already built), `Makefile`
>
> ## Done When
> - [ ] All 22 commits made in order
> - [ ] `make test-mobile` passes
> - [ ] Full navigation flow works: auth → servers → chat → real-time messages
> - [ ] `git log --oneline` shows clean, atomic history

---

## Phase 2: Integration
> Starts after both `dm-backend` and `mobile-core` are merged.

### Worktree: `mobile-integration`
- **Branch**: `feat/mobile-integration`
- **Purpose**: Add DM mobile screens, visual polish with cyberpunk animations, error handling, and EAS build configuration.
- **Depends on**: `dm-backend` (for DM API) + `mobile-core` (for navigation + hooks)
- **Commit sequence**:

| # | Commit message | Files | Verify |
|---|---------------|-------|--------|
| 1 | `feat(mobile): implement DM Zustand store` | `mobile/src/stores/dmStore.ts`, `mobile/src/stores/__tests__/dmStore.test.ts` | Store tests pass |
| 2 | `feat(mobile): add DM API methods to mobile API service` | `mobile/src/services/api.ts` (modify) | Types compile |
| 3 | `feat(mobile): implement DMListScreen` | `mobile/src/screens/dms/DMListScreen.tsx` (replace placeholder), tests | DM list tests pass |
| 4 | `feat(mobile): implement DMChatScreen` | `mobile/src/screens/dms/DMChatScreen.tsx`, tests | DM chat tests pass |
| 5 | `feat(mobile): wire DM WebSocket events and navigation` | `mobile/src/hooks/useWebSocketEvents.ts` (modify), DM tab navigation | Full DM flow works |
| 6 | `feat(mobile): add glow effects and neon borders to active states` | `mobile/src/components/ui/GlowBorder.tsx` (modify), active state styles | Visual effects render |
| 7 | `feat(mobile): add screen transition animations` | Navigation animation config, message entrance animations, loading pulse | Animations smooth |
| 8 | `feat(mobile): add haptic feedback and platform polish` | Platform-specific config, `mobile/app.json` updates | Haptics fire on actions |
| 9 | `feat(mobile): add error boundaries with cyberpunk fallback` | `mobile/src/components/ErrorBoundary.tsx`, `mobile/src/components/ErrorFallback.tsx`, `mobile/App.tsx` (wrap) | Error boundary catches errors |
| 10 | `feat(mobile): add toast notification system` | `mobile/src/components/ui/Toast.tsx`, `mobile/src/hooks/useToast.ts` | Toast appears on errors |
| 11 | `test(mobile): add integration tests for critical flows` | `mobile/src/__tests__/auth-flow.test.tsx`, `chat-flow.test.tsx`, `dm-flow.test.tsx`, `server-management.test.tsx` | Integration tests pass |
| 12 | `chore(mobile): configure EAS Build with dev/preview/production profiles` | `mobile/eas.json`, `mobile/app.json` (final), `mobile/README.md` | EAS config valid |

- **Done when**: Full app works end-to-end including DMs, all tests pass, `eas build --profile preview` config is valid
- **Claude Code prompt**:

> You are working on the Thicket project (a cyberpunk Discord clone) in a git worktree dedicated to adding DM screens, visual polish, error handling, and build configuration to the React Native mobile app.
>
> ## Context
> The mobile app's core functionality is complete: navigation, auth, servers, channels, chat, real-time events, and server management are all built (from the `mobile-core` branch). The DM backend is also complete with REST endpoints and WebSocket events (from the `dm-backend` branch). Both have been merged. You now need to build the DM mobile screens, add cyberpunk visual polish, error handling, and EAS build setup.
>
> ## Your Goal
> 1. Create DM Zustand store + add DM API methods to mobile API service
> 2. Build DMListScreen and DMChatScreen (reusing MessageItem + MessageInput from chat)
> 3. Wire DM WebSocket events into existing useWebSocketEvents hook
> 4. Add cyberpunk visual polish: glow effects, screen transitions, haptics
> 5. Add error boundaries and toast notifications
> 6. Write integration tests for critical flows
> 7. Configure EAS Build
>
> ## Key Reference Files
> - `mobile/src/stores/messageStore.ts` — pattern for DM store
> - `mobile/src/screens/chat/ChatScreen.tsx` — pattern for DMChatScreen (reuse components)
> - `mobile/src/components/chat/MessageItem.tsx` — reuse in DM chat
> - `mobile/src/components/chat/MessageInput.tsx` — reuse in DM chat
> - `mobile/src/hooks/useWebSocketEvents.ts` — add DM event handlers here
> - `mobile/src/services/api.ts` — add DM namespace methods
> - `mobile/src/navigation/MainTabs.tsx` — DM tab navigation
> - `frontend/src/renderer/services/api.ts` — reference for DM API shape (dms.list, dms.create, etc.)
>
> ## DM API Shape (already implemented in backend)
> - `GET /api/dms` — list conversations with participant info
> - `POST /api/dms` — create conversation `{participant_id}`
> - `GET /api/dms/:id/messages?before=&limit=` — paginated messages
> - `POST /api/dms/:id/messages` — send message `{content}`
> - `DELETE /api/dm-messages/:id` — delete message
>
> ## DM WebSocket Events
> - `DM_MESSAGE_CREATE` — new DM message received
> - `DM_MESSAGE_DELETE` — DM message deleted
> - Subscribe to `dm:{conversationId}` channel
>
> ## Commit Discipline — IMPORTANT
> You MUST make one atomic commit per task below. Follow these rules strictly:
> - Complete each task fully before committing (code + tests for that task)
> - Verify the build passes and relevant tests pass BEFORE each commit
> - Use the exact commit messages provided below
> - NEVER combine multiple tasks into one commit
> - NEVER leave a commit in a broken state
>
> After each commit, run the verification step listed. If it fails, fix it within the same commit (amend).
>
> ## Commit Sequence
>
> ### Commit 1: `feat(mobile): implement DM Zustand store`
> - `mobile/src/stores/dmStore.ts`
>   - State: `conversations[]`, `activeConversationId`, `messages[]`, `isLoading`, `hasMore`
>   - Actions: `fetchConversations()`, `setActiveConversation()`, `fetchMessages()`, `sendMessage()`, `addMessage()`, `clearMessages()`
> - Write tests in `mobile/src/stores/__tests__/dmStore.test.ts`
> - Verify: Store tests pass
>
> ### Commit 2: `feat(mobile): add DM API methods to mobile API service`
> - Add `dms` namespace to `mobile/src/services/api.ts`:
>   - `dms.list()`, `dms.create(participantId)`, `dms.messages.list(id, before, limit)`, `dms.messages.send(id, content)`, `dms.messages.delete(messageId)`
> - Verify: Types compile
>
> ### Commit 3: `feat(mobile): implement DMListScreen`
> - Replace placeholder `mobile/src/screens/dms/DMListScreen.tsx`
> - FlatList of conversations showing participant names/avatars, last message preview
> - "New Message" FAB to create a new DM (user search/select)
> - Pull-to-refresh
> - Write tests
> - Verify: Tests pass
>
> ### Commit 4: `feat(mobile): implement DMChatScreen`
> - `mobile/src/screens/dms/DMChatScreen.tsx` — reuses MessageItem and MessageInput components
> - Same pattern as ChatScreen: inverted FlatList, WS subscription (`dm:{conversationId}`), pagination
> - Header shows participant name(s)
> - Write tests
> - Verify: Tests pass
>
> ### Commit 5: `feat(mobile): wire DM WebSocket events and navigation`
> - Update `mobile/src/hooks/useWebSocketEvents.ts` to handle DM_MESSAGE_CREATE/DELETE
> - Update DM tab navigation: DMListScreen → DMChatScreen stack
> - Verify: Full DM flow works end-to-end
>
> ### Commit 6: `feat(mobile): add glow effects and neon borders to active states`
> - Apply GlowBorder to: selected server, active channel, focused inputs
> - NativeWind shadow utilities for neon glow (custom native shadow for Android if needed)
> - Verify: Visual effects render correctly
>
> ### Commit 7: `feat(mobile): add screen transition animations`
> - React Navigation animation config: stack slides, modal fade-up, tab crossfade
> - Message list item entrance animations (LayoutAnimation or Animated)
> - Pulse animation for "THICKET" loading text
> - Verify: Animations are smooth
>
> ### Commit 8: `feat(mobile): add haptic feedback and platform polish`
> - `expo-haptics` on message send, server select, button presses
> - iOS: safe area, light status bar
> - Android: nav bar color `#0a0a0f`, status bar translucent
> - Update `app.json` splash screen + icon configuration
> - Verify: Haptics fire on key actions
>
> ### Commit 9: `feat(mobile): add error boundaries with cyberpunk fallback`
> - `mobile/src/components/ErrorBoundary.tsx` + `ErrorFallback.tsx`
> - Cyberpunk "SYSTEM FAILURE" screen with retry button
> - Wrap App.tsx with ErrorBoundary
> - Verify: Error boundary catches and displays errors
>
> ### Commit 10: `feat(mobile): add toast notification system`
> - `mobile/src/components/ui/Toast.tsx` + `mobile/src/hooks/useToast.ts`
> - Handle: 401 (redirect login), 403 (permission denied), 429 (rate limited), 500 (server error)
> - Verify: Toasts appear on API errors
>
> ### Commit 11: `test(mobile): add integration tests for critical flows`
> - `mobile/src/__tests__/auth-flow.test.tsx` — login → see servers
> - `mobile/src/__tests__/chat-flow.test.tsx` — select server → channel → send message
> - `mobile/src/__tests__/dm-flow.test.tsx` — create DM → send message → real-time
> - `mobile/src/__tests__/server-management.test.tsx` — create/join/leave server
> - Verify: All integration tests pass
>
> ### Commit 12: `chore(mobile): configure EAS Build with dev/preview/production profiles`
> - `mobile/eas.json` with dev/preview/production profiles
> - Final `mobile/app.json` with icons, splash screen, bundle identifiers
> - `mobile/README.md` with setup, dev, and build instructions
> - Verify: EAS config is valid
>
> ## Boundaries
> - ONLY modify files in: `mobile/`
> - Do NOT touch: `backend/`, `frontend/`, `Makefile`
>
> ## Done When
> - [ ] All 12 commits made in order
> - [ ] `make test-mobile` passes
> - [ ] Full DM flow works end-to-end
> - [ ] Cyberpunk visual polish is consistent with Electron app
> - [ ] Integration tests pass
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

# Phase 0: Both start immediately (parallel)
echo "Creating foundation worktree..."
git worktree add "../${REPO_NAME}-wt-foundation" -b feat/mobile-foundation "$BASE_BRANCH"

echo "Creating dm-backend worktree..."
git worktree add "../${REPO_NAME}-wt-dm-backend" -b feat/dm-backend "$BASE_BRANCH"

# Phase 1: Created now, worked on after foundation merges
echo "Creating mobile-core worktree..."
git worktree add "../${REPO_NAME}-wt-mobile-core" -b feat/mobile-core "$BASE_BRANCH"

# Phase 2: Created now, worked on after dm-backend + mobile-core merge
echo "Creating mobile-integration worktree..."
git worktree add "../${REPO_NAME}-wt-mobile-integration" -b feat/mobile-integration "$BASE_BRANCH"

echo ""
echo "All worktrees created! Run 'git worktree list' to see them."
echo ""
echo "Workflow:"
echo "   Phase 0 (parallel):"
echo "   1. cd ../${REPO_NAME}-wt-foundation && claude"
echo "   2. cd ../${REPO_NAME}-wt-dm-backend && claude"
echo "   (run both simultaneously)"
echo ""
echo "   After foundation completes:"
echo "   3. Merge feat/mobile-foundation into main"
echo "   4. cd ../${REPO_NAME}-wt-mobile-core && git merge main && claude"
echo ""
echo "   After mobile-core AND dm-backend both complete:"
echo "   5. Merge feat/dm-backend and feat/mobile-core into main"
echo "   6. cd ../${REPO_NAME}-wt-mobile-integration && git merge main && claude"
echo ""
echo "   After mobile-integration completes:"
echo "   7. Merge feat/mobile-integration into main"
echo "   8. Cleanup: git worktree remove ../${REPO_NAME}-wt-*"
```

---

## Merge Order

Merge branches back to main in this order:

1. **`feat/mobile-foundation`** → main (after Phase 0 foundation completes)
2. **`feat/dm-backend`** → main (after Phase 0 dm-backend completes, can merge before or after foundation)
3. **`feat/mobile-core`** → main (after Phase 1 completes)
4. **`feat/mobile-integration`** → main (after Phase 2 completes)

Before each merge, rebase onto main to keep a clean history:
```bash
cd ../discord_clone-wt-<worktree>
git fetch origin
git rebase origin/main
# There should be zero conflicts if file ownership was respected
git push origin feat/<branch-name>
# Then create PR and merge
```

---

## Notes

- **dm-backend has uncommitted work**: `backend/internal/service/dm_service.go` exists but is untracked, and `backend/internal/models/dm.go` has uncommitted modifications. Before creating the dm-backend worktree, decide whether to commit this existing work to main first, or include it in the dm-backend branch.
- **Install dependencies in each worktree**: After creating worktrees for mobile work, run `cd mobile && npm install` before starting Claude Code.
- **dm-backend runs "for free"**: Since it touches zero mobile files, it runs entirely in parallel with the mobile pipeline. Even if it takes longer than expected, it only blocks the integration phase.
- **The mobile pipeline is the critical path**: foundation (12) → mobile-core (22) → mobile-integration (12) = 46 commits. Optimize by keeping the mobile Claude Code sessions focused and unblocked.
