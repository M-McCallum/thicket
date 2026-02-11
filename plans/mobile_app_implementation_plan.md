# Thicket React Native Mobile App -- Implementation Plan

## Context

The Thicket project is a cyberpunk-themed Discord clone with a Go backend (Fiber v3 + PostgreSQL) and an Electron desktop frontend (React 19 + Zustand + Tailwind). This plan adds a **React Native mobile app** in a new `mobile/` directory within the same monorepo, covering the same functionality as the Electron app **plus Direct Messages** (which requires backend work since DMs are currently only at the DB schema/model level).

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | React Native + Expo (managed) | Fastest setup, OTA updates, EAS builds |
| Navigation | React Navigation | Industry standard for RN |
| State | Zustand | Same as Electron -- stores are portable |
| Storage | expo-secure-store (tokens), AsyncStorage (prefs) | Secure credential storage |
| Styling | **NativeWind v4** (Tailwind for RN) | Matches Electron app's Tailwind classes; reuse `tailwind.config.js` theme tokens |
| Testing | Jest + React Native Testing Library | Standard RN testing stack |

## Code Reuse Strategy

| Source | Strategy |
|--------|----------|
| `types/models.ts`, `types/api.ts`, `types/ws.ts` | **Copy verbatim** -- zero platform deps |
| `stores/serverStore.ts`, `stores/messageStore.ts` | **Copy verbatim** -- pure Zustand |
| `services/api.ts` | **~95% identical** -- swap hardcoded URL for configurable constant |
| `services/ws.ts` | **~90% identical** -- add AppState awareness, configurable URL |
| `stores/authStore.ts` | **~80% identical** -- replace localStorage with SecureStore (async) |
| `tailwind.config.js` | **Extend/share** -- NativeWind uses the same Tailwind config format |
| All UI components | **Full rewrite** -- RN primitives, but can use same `className` strings via NativeWind |

## Mobile UI Layout

```
Desktop:  [ServerSidebar] [ChannelSidebar] [ChatArea] [MemberList]
Mobile:   Bottom Tabs (Servers | DMs | Chat | Profile)
          Chat tab uses Drawer (left = channels, main = messages)
          MemberList via header button -> bottom sheet
          DMs tab has conversation list -> tap to open DM chat
```

---

## Phase 1: Project Scaffold & Shared Code (8 commits)

**Goal**: Expo project, NativeWind configured, shared types/services/stores ported, tests running.

### Commit 1.1: Initialize Expo project
- `npx create-expo-app@latest mobile --template blank-typescript`
- Creates `mobile/` with `App.tsx`, `app.json`, `package.json`, `tsconfig.json`
- **Verify**: `cd mobile && npx expo start` launches Metro bundler

### Commit 1.2: Install core dependencies
- Navigation: `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`, `@react-navigation/drawer`
- RN essentials: `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`, `react-native-reanimated`
- State/storage: `zustand`, `expo-secure-store`, `@react-native-async-storage/async-storage`
- NativeWind: `nativewind`, `tailwindcss` (peer dep)
- Fonts/platform: `expo-font`, `expo-splash-screen`, `expo-status-bar`, `expo-constants`, `expo-clipboard`, `expo-haptics`
- Dev: `@testing-library/react-native`, `jest-expo`, `@types/react`
- **Verify**: `npx expo start` still works; `npx jest --passWithNoTests` exits 0

### Commit 1.3: Configure NativeWind + Tailwind
- Create `mobile/tailwind.config.js` extending/importing theme tokens from `frontend/tailwind.config.js` (cyberpunk colors, fonts, shadows, animations)
- Configure `babel.config.js` with `nativewind/babel` preset
- Create `mobile/global.css` with `@tailwind` directives
- Configure Metro to use NativeWind's CSS transformer
- **Verify**: `className="bg-cyber-bg text-neon-cyan"` renders correct colors on simulator

### Commit 1.4: Configure Jest, TypeScript, and path aliases
- `mobile/jest.config.ts` with `jest-expo` preset, NativeWind mocks
- `mobile/jest-setup.ts` mocking SecureStore, AsyncStorage, NativeWind
- `tsconfig.json` paths: `@/* -> ./src/*`, strict mode
- `babel.config.js` with `module-resolver` for `@/` alias and `reanimated` plugin
- **Verify**: `npx jest --passWithNoTests` passes; `npx tsc --noEmit` passes

### Commit 1.5: Copy shared types from Electron frontend
- Copy `frontend/src/renderer/types/{models,api,ws}.ts` -> `mobile/src/types/`
- Add DM-specific WS event types to `ws.ts`: `DM_MESSAGE_CREATE`, `DM_MESSAGE_UPDATE`, `DM_MESSAGE_DELETE`
- **Verify**: `npx tsc --noEmit` -- types compile with no platform deps

### Commit 1.6: Port API service with configurable base URL
- `mobile/src/config.ts` -- exports `API_BASE_URL` and `WS_BASE_URL` using `__DEV__` flag
- `mobile/src/services/api.ts` -- from `frontend/src/renderer/services/api.ts`, swap hardcoded URL; add DM API namespace (for Phase 9)
- `mobile/src/services/__tests__/api.test.ts`
- **Verify**: API service tests pass

### Commit 1.7: Port WebSocket service and Zustand stores
- `mobile/src/services/ws.ts` -- from `frontend/src/renderer/services/ws.ts`, add `AppState` listener, configurable URL
- `mobile/src/stores/authStore.ts` -- replace `localStorage` with `SecureStore` (async)
- `mobile/src/stores/serverStore.ts` -- verbatim copy
- `mobile/src/stores/messageStore.ts` -- verbatim copy
- `mobile/src/stores/__tests__/{authStore,serverStore,messageStore}.test.ts` -- port from Vitest to Jest
- `mobile/src/services/__tests__/ws.test.ts`
- **Verify**: All ~18 store + service tests pass

### Commit 1.8: Add Makefile targets
- Add `dev-mobile`, `test-mobile`, `lint-mobile` to root `Makefile`
- Update `test` target to include `test-mobile`
- **Verify**: `make test-mobile` and `make lint-mobile` pass

---

## Phase 2: Theme & Base UI Components (4 commits)

**Goal**: Custom fonts loaded, reusable UI primitives with NativeWind classes.

### Commit 2.1: Load custom fonts
- Add font files to `mobile/assets/fonts/` (Orbitron, Inter, Share Tech Mono)
- `mobile/src/hooks/useLoadFonts.ts` using `expo-font` `useFonts` hook
- **Verify**: Fonts render correctly on simulator

### Commit 2.2: Create Text, Input, Button components
- `mobile/src/components/ui/CyberText.tsx` -- variants: `display` (font-display/Orbitron), `body` (font-body/Inter), `mono` (font-mono/Share Tech Mono), `label` (uppercase mono)
- `mobile/src/components/ui/Input.tsx` -- NativeWind `className` matching `.input-field` styles: `bg-cyber-bg border border-cyber-text-muted/30 focus:border-neon-cyan`
- `mobile/src/components/ui/Button.tsx` -- variants: `primary` (cyan border + glow), `danger` (red), `ghost`; props: `loading`, `disabled`
- Tests for each

### Commit 2.3: Create Avatar, Modal, LoadingScreen
- `Avatar.tsx` -- circular initial letter with status indicator dot
- `Modal.tsx` -- dark overlay modal (`bg-black/60`)
- `LoadingScreen.tsx` -- pulsing "THICKET" text on `bg-cyber-bg`
- Tests for each

### Commit 2.4: Create remaining UI primitives
- `Divider.tsx` -- neon accent line
- `OfflineBanner.tsx` -- network status banner
- `GlowBorder.tsx` -- wrapper with neon glow shadow
- `mobile/src/components/ui/index.ts` -- barrel export

---

## Phase 3: Navigation & Auth Screens (4 commits)

**Goal**: React Navigation tree, login/signup, token restoration.

### Commit 3.1: Root navigator with auth/main split
- `mobile/src/navigation/RootNavigator.tsx` -- stack: AuthStack vs MainTabs
- `mobile/src/navigation/types.ts` -- navigation param types
- Update `App.tsx` with `NavigationContainer`, `SafeAreaProvider`, font loading, dark theme
- **Verify**: App shows loading screen then auth screen

### Commit 3.2: LoginScreen
- `mobile/src/screens/auth/LoginScreen.tsx` -- port of `LoginForm.tsx`
- Same logic: `isSignup` toggle, form validation, `useAuthStore()` integration
- Mobile: `KeyboardAvoidingView`, `ScrollView`, `secureTextEntry`
- NativeWind classes matching the Electron cyberpunk styles
- `mobile/src/screens/auth/__tests__/LoginScreen.test.tsx`

### Commit 3.3: App initialization with secure storage
- `mobile/src/hooks/useAppInit.ts` -- reads tokens from SecureStore, restores auth state
- Returns `{ initialized: boolean }` for loading screen
- `mobile/src/hooks/__tests__/useAppInit.test.ts`

### Commit 3.4: Auth stack navigator
- `mobile/src/navigation/AuthStack.tsx` -- contains LoginScreen
- Wire into RootNavigator
- **Verify**: Full auth flow -- login persists across app restart

---

## Phase 4: Main Layout & Server Navigation (6 commits)

**Goal**: Bottom tabs, server list, channel drawer, core navigation flow.

### Commit 4.1: MainTabs bottom tab navigator
- `mobile/src/navigation/MainTabs.tsx` -- 4 tabs: Servers, DMs (placeholder), Chat, Profile
- Tab bar: `bg-cyber-bg-secondary`, `text-neon-cyan` active, `text-cyber-text-muted` inactive
- **Verify**: Tabs render and switch

### Commit 4.2: ServersScreen (list view)
- `mobile/src/screens/servers/ServersScreen.tsx` -- FlatList of server cards (icon + name)
- Tapping sets active server and navigates to Chat tab
- `fetchServers()` on mount; pull-to-refresh
- Create/Join buttons in header
- Tests

### Commit 4.3: Create Server and Join Server modals
- `mobile/src/screens/servers/CreateServerModal.tsx` -- name input, create action
- `mobile/src/screens/servers/JoinServerModal.tsx` -- invite code input, join action
- Tests for both

### Commit 4.4: Chat tab with Drawer navigator
- `mobile/src/navigation/ChatDrawer.tsx` -- left drawer = channel list, main = chat
- Drawer width 280px, `bg-cyber-bg-secondary`, swipe from left edge
- **Verify**: Swipe opens channel list

### Commit 4.5: ChannelDrawerContent
- `mobile/src/components/chat/ChannelDrawerContent.tsx` -- port of `ChannelSidebar.tsx`
- Text/voice channels grouped, `#` prefix, active highlighted `text-neon-cyan`
- Server name header, tappable invite code (copies to clipboard via `expo-clipboard`)
- Tests

### Commit 4.6: Placeholder screens
- `mobile/src/screens/chat/ChatScreen.tsx` -- placeholder with channel name
- `mobile/src/screens/profile/ProfileScreen.tsx` -- user info + logout
- `mobile/src/screens/dms/DMListScreen.tsx` -- placeholder "DMs coming soon"
- **Verify**: Full nav flow works end-to-end

---

## Phase 5: Chat Functionality (5 commits)

**Goal**: Complete chat with real-time messages, sending, pagination.

### Commit 5.1: MessageItem component
- `mobile/src/components/chat/MessageItem.tsx` -- port of `MessageItem.tsx`
- Avatar, author name (`text-neon-cyan` if own), timestamp, content, "(edited)" indicator
- Tests

### Commit 5.2: ChatScreen with message list
- Replace placeholder with full implementation (port of `ChatArea.tsx`)
- `FlatList` with `inverted={true}` for bottom-to-top ordering
- `useEffect` on `activeChannelId`: clear messages, fetch, subscribe WS channel
- Listen for `MESSAGE_CREATE` WS events, add to store
- Channel header with drawer toggle and member list button
- Empty states for no server/channel selected
- Tests

### Commit 5.3: MessageInput with keyboard avoidance
- `mobile/src/components/chat/MessageInput.tsx` -- text input + send button
- `KeyboardAvoidingView` (iOS padding, Android height)
- Clears input and dismisses keyboard on send
- Tests

### Commit 5.4: Message pagination (infinite scroll)
- `onEndReached` on inverted FlatList triggers `fetchMessages` with `before` cursor
- Loading indicator at list end; respects `hasMore` flag
- **Verify**: Scrolling up loads older messages

### Commit 5.5: MemberListSheet
- `mobile/src/components/chat/MemberListSheet.tsx` -- port of `MemberList.tsx`
- Bottom sheet with online/offline groups, role colors (owner=`text-neon-cyan`, admin=`text-neon-magenta`)
- Status dots: online=`bg-neon-green`, idle=yellow, dnd=`bg-neon-red`, offline=`bg-cyber-text-muted`
- Tests

---

## Phase 6: Real-time Features (4 commits)

**Goal**: All WS events wired, typing indicators, app lifecycle, network handling.

### Commit 6.1: Global WebSocket event handlers
- `mobile/src/hooks/useWebSocketEvents.ts` -- sets up all WS listeners:
  - MESSAGE_CREATE/UPDATE/DELETE -> messageStore
  - CHANNEL_CREATE/UPDATE/DELETE -> serverStore
  - MEMBER_JOIN/LEAVE -> serverStore
  - PRESENCE_UPDATE -> update member status
- Tests

### Commit 6.2: Typing indicators
- `mobile/src/components/chat/TypingIndicator.tsx` -- "User is typing..." with animated dots
- Listens to `TYPING_START` events, clears after 5s
- MessageInput sends debounced `TYPING_START` on text change
- Tests

### Commit 6.3: App lifecycle management
- `mobile/src/hooks/useAppLifecycle.ts` -- AppState listener
- Background: pause WS heartbeat
- Foreground: reconnect WS if needed, re-fetch active channel
- Tests

### Commit 6.4: Network connectivity handling
- `mobile/src/hooks/useNetworkStatus.ts` -- uses `@react-native-community/netinfo`
- `OfflineBanner` component from Phase 2 wired up
- WS reconnect on restore; disable send when offline

---

## Phase 7: Server Management & Profile (3 commits)

**Goal**: Server actions, full profile screen, channel creation.

### Commit 7.1: Server action sheet
- `mobile/src/screens/servers/ServerActionsSheet.tsx` -- long-press on server card
- Copy invite code, leave server, delete server (owner only with confirmation)
- Tests

### Commit 7.2: Full ProfileScreen
- User info card, status picker (online/idle/dnd/offline -> PRESENCE_UPDATE), logout, app version
- Tests

### Commit 7.3: Channel creation modal
- `mobile/src/components/chat/CreateChannelModal.tsx` -- name + text/voice type selector
- Accessible from "+" button in ChannelDrawerContent
- Tests

---

## Phase 8: DM Backend Implementation (5 commits)

**Goal**: Build the DM backend (service, handler, routes, WS events). The DB schema and models already exist.

**Current state**: `dm_conversations`, `dm_participants`, `dm_messages` tables exist in migrations. Model types (`DMConversation`, `DMParticipant`, `DMMessage`, `DMMessageWithAuthor`, `DMParticipantUser`) and query methods (`CreateDMConversation`, `AddDMParticipant`, `GetDMParticipant`, `GetUserDMConversations`, `GetDMParticipants`, `CreateDMMessage`, `GetDMMessages`, `FindExistingDMConversation`) exist in `backend/internal/models/dm.go`.

### Commit 8.1: DM service layer
- `backend/internal/service/dm_service.go`
  - `CreateConversation(ctx, creatorID, participantIDs)` -- dedup 1:1 via `FindExistingDMConversation`, add all participants
  - `GetConversations(ctx, userID)` -- list user's DM conversations with participant info
  - `SendMessage(ctx, conversationID, authorID, content)` -- verify author is participant, sanitize content
  - `GetMessages(ctx, conversationID, userID, before, limit)` -- verify user is participant, cursor pagination
  - `DeleteMessage(ctx, messageID, userID)` -- author only
- `backend/internal/service/dm_service_test.go` -- TDD with testcontainers
- **Verify**: `make test-backend` passes

### Commit 8.2: DM handler layer
- `backend/internal/handler/dm_handler.go`
  - `POST /api/dms` -- create conversation (body: `{participant_ids: []string}`)
  - `GET /api/dms` -- list user's conversations
  - `GET /api/dms/:id/messages` -- get messages (query: `before`, `limit`)
  - `POST /api/dms/:id/messages` -- send message (body: `{content}`)
  - `DELETE /api/dm-messages/:id` -- delete message
- `backend/internal/handler/dm_handler_test.go` -- HTTP integration tests
- **Verify**: Handler tests pass

### Commit 8.3: Register DM routes
- Update `backend/internal/router/router.go` to add DM route group under auth middleware
- Add `DMHandler` to router `Config` struct
- Wire up in `backend/cmd/server/main.go`
- **Verify**: `curl` tests against running server confirm endpoints work

### Commit 8.4: DM WebSocket events
- Add to `backend/internal/ws/events.go`: `EVENT_DM_MESSAGE_CREATE`, `EVENT_DM_MESSAGE_UPDATE`, `EVENT_DM_MESSAGE_DELETE`
- Update hub to broadcast DM events to conversation participants (subscribe to `dm:{conversationID}`)
- Update DM handler to publish WS events on message create/delete
- Tests for WS DM event broadcasting

### Commit 8.5: DM API methods in Electron frontend API service
- Add DM methods to `frontend/src/renderer/services/api.ts`: `dms.list()`, `dms.create()`, `dms.messages.list()`, `dms.messages.send()`, `dms.messages.delete()`
- Add DM WS event types to `frontend/src/renderer/types/ws.ts`
- This ensures both Electron and mobile can consume the same DM API
- **Verify**: `make test-backend` passes; API service compiles

---

## Phase 9: DM Mobile Screens (5 commits)

**Goal**: Full DM experience on mobile -- conversation list, DM chat, DM store.

### Commit 9.1: DM Zustand store
- `mobile/src/stores/dmStore.ts`
  - State: `conversations[]`, `activeConversationId`, `messages[]`, `isLoading`, `hasMore`
  - Actions: `fetchConversations()`, `setActiveConversation()`, `fetchMessages()`, `sendMessage()`, `addMessage()`, `clearMessages()`
- `mobile/src/stores/__tests__/dmStore.test.ts`

### Commit 9.2: DM API methods in mobile API service
- Add `dms` namespace to `mobile/src/services/api.ts`:
  - `dms.list()`, `dms.create(participantIds)`, `dms.messages.list(id, before, limit)`, `dms.messages.send(id, content)`, `dms.messages.delete(messageId)`
- **Verify**: Types compile

### Commit 9.3: DMListScreen
- `mobile/src/screens/dms/DMListScreen.tsx` -- replace placeholder
- FlatList of conversations showing participant names/avatars, last message preview
- "New Message" FAB to create a new DM (user search/select)
- Pull-to-refresh
- Tests

### Commit 9.4: DMChatScreen
- `mobile/src/screens/dms/DMChatScreen.tsx` -- reuses `MessageItem` and `MessageInput` components
- Same pattern as `ChatScreen`: inverted FlatList, WS subscription (`dm:{conversationId}`), pagination
- Header shows participant name(s)
- Tests

### Commit 9.5: Wire DM WebSocket events
- Update `useWebSocketEvents.ts` to handle `DM_MESSAGE_CREATE/UPDATE/DELETE`
- Update DM tab navigation: DMListScreen -> DMChatScreen stack
- **Verify**: Full DM flow: create conversation -> send message -> see in real-time on both devices

---

## Phase 10: Visual Polish & Animations (3 commits)

**Goal**: Cyberpunk visual flair, glow effects, transitions, haptics.

### Commit 10.1: Glow effects and neon borders
- `GlowBorder.tsx` applied to active states: selected server, active channel, focused inputs
- NativeWind shadow utilities for neon glow (may need custom native shadow for Android)

### Commit 10.2: Screen transition animations
- React Navigation animation config: stack slides, modal fade-up, tab crossfade
- Message list item entrance animations (`LayoutAnimation` or `Animated`)
- Pulse animation for "THICKET" loading text

### Commit 10.3: Haptic feedback and platform polish
- `expo-haptics` on message send, server select, button presses
- iOS: safe area, light status bar
- Android: nav bar color `#0a0a0f`, status bar translucent
- `app.json` splash screen + icon configuration

---

## Phase 11: Error Handling & Build (4 commits)

**Goal**: Error boundaries, toasts, integration tests, EAS build config.

### Commit 11.1: Error boundaries
- `mobile/src/components/ErrorBoundary.tsx` + `ErrorFallback.tsx`
- Cyberpunk "SYSTEM FAILURE" screen with retry button

### Commit 11.2: Toast notification system
- `mobile/src/components/ui/Toast.tsx` + `mobile/src/hooks/useToast.ts`
- Handle: 401 (redirect login), 403 (permission denied), 429 (rate limited), 500 (server error)

### Commit 11.3: Integration tests for critical flows
- `mobile/src/__tests__/auth-flow.test.tsx` -- login -> see servers
- `mobile/src/__tests__/chat-flow.test.tsx` -- select server -> channel -> send message
- `mobile/src/__tests__/dm-flow.test.tsx` -- create DM -> send message -> real-time
- `mobile/src/__tests__/server-management.test.tsx` -- create/join/leave server

### Commit 11.4: EAS Build configuration
- `mobile/eas.json` with dev/preview/production profiles
- Final `app.json` with icons, splash screen, bundle identifiers
- `mobile/README.md` with setup, dev, and build instructions

---

## Verification Plan

| Phase | Automated | Manual |
|-------|-----------|--------|
| 1 | `make test-mobile && make lint-mobile` | Metro bundler starts |
| 2 | UI component render tests pass | Fonts + NativeWind classes render on simulator |
| 3 | Auth store/screen tests pass | Signup -> login -> logout -> token persists across restart |
| 4 | Navigation tests pass | Tabs switch, drawer swipes, servers load |
| 5 | Chat tests pass | Messages load, real-time delivery, send, pagination |
| 6 | Hook tests pass | Background/foreground reconnect, typing, offline banner |
| 7 | Action tests pass | Create/join/leave/delete server |
| 8 | `make test-backend` passes | DM endpoints work via curl/Postman |
| 9 | DM store + screen tests pass | Create DM -> send -> real-time on second device |
| 10 | -- | Visual consistency with Electron cyberpunk theme |
| 11 | Integration tests pass | `eas build --profile preview` succeeds |

## Key Files to Reference

| File | Purpose |
|------|---------|
| `frontend/src/renderer/services/api.ts` | API client with token refresh |
| `frontend/src/renderer/services/ws.ts` | WebSocket client |
| `frontend/src/renderer/stores/authStore.ts` | Auth state (port to SecureStore) |
| `frontend/src/renderer/components/chat/ChatArea.tsx` | Most complex component to port |
| `frontend/src/renderer/components/server/MemberList.tsx` | Role colors and status dots |
| `frontend/tailwind.config.js` | Cyberpunk theme tokens (share with NativeWind) |
| `backend/internal/router/router.go` | All REST endpoints |
| `backend/internal/ws/events.go` | All WebSocket event types |
| `backend/internal/models/dm.go` | DM query methods (already exist) |
| `backend/internal/database/queries/dm.sql` | DM SQL queries (already exist) |

## Directory Structure

```
mobile/
  App.tsx
  app.json
  babel.config.js
  tailwind.config.js          # Extends/shares frontend theme tokens
  global.css                   # NativeWind @tailwind directives
  metro.config.js              # NativeWind CSS transformer
  eas.json
  jest.config.ts
  jest-setup.ts
  package.json
  tsconfig.json
  README.md
  assets/fonts/                # Orbitron, Inter, Share Tech Mono
  src/
    config.ts
    types/{models,api,ws}.ts
    services/{api,ws}.ts + __tests__/
    stores/{auth,server,message,dm}Store.ts + __tests__/
    theme/                     # Only needed if NativeWind doesn't cover shadows/fonts fully
    hooks/{useLoadFonts,useAppInit,useWebSocketEvents,useAppLifecycle,useNetworkStatus,useToast}.ts
    navigation/{RootNavigator,AuthStack,MainTabs,ChatDrawer,types}.tsx
    screens/
      auth/LoginScreen.tsx
      servers/{ServersScreen,CreateServerModal,JoinServerModal,ServerActionsSheet}.tsx
      chat/ChatScreen.tsx
      dms/{DMListScreen,DMChatScreen}.tsx
      profile/ProfileScreen.tsx
    components/
      ui/{CyberText,Input,Button,Avatar,Modal,Divider,GlowBorder,LoadingScreen,OfflineBanner,Toast,index}.tsx
      chat/{MessageItem,MessageInput,ChannelDrawerContent,MemberListSheet,TypingIndicator,CreateChannelModal}.tsx
      {ErrorBoundary,ErrorFallback}.tsx
    __tests__/{auth-flow,chat-flow,dm-flow,server-management}.test.tsx
```
