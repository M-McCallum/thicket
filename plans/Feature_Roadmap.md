# Feature Roadmap: Privacy-First Discord Alternative

> **Positioning:** Open-source, end-to-end encrypted, self-hostable community platform with Discord-quality UX.
> **Guiding principle:** Ship what users love about Discord, fix what they hate, and never paywall core communication.

---

## Phase 1: Foundation (MVP)
*Goal: A usable chat platform people would actually switch to. Text + voice that "just works."*

### 1.1 Core Messaging
- [ ] Real-time text messaging with WebSocket sync across clients
- [ ] Markdown formatting (bold, italic, strikethrough, code blocks with syntax highlighting, spoiler tags, blockquotes, headers)
- [ ] **Add table support** — Discord still doesn't have this; devs and power users want it
- [ ] Message editing with visible edit indicator and edit history (Discord hides history)
- [ ] Message deletion (for sender + admins)
- [ ] Inline replies with jump-to-original (keep the quote feature Discord removed)
- [ ] Reactions with standard Unicode emoji
- [ ] Link previews / embeds (Open Graph) — make these reliable, unlike Discord's broken Twitter/Reddit embeds
- [ ] File sharing — **25MB minimum free tier** (Discord's 10MB reduction is one of their most hated changes)
- [ ] Image, video, and audio inline display with proper media controls
- [ ] Built-in GIF picker (Tenor or Giphy integration) with server-level toggle for admins

### 1.2 Core Voice
- [ ] Persistent voice channels with drop-in/drop-out (Discord's #1 loved feature)
- [ ] Push-to-talk AND voice activity detection
- [ ] **Per-server/per-channel input mode** — Discord users have begged for this for 5+ years
- [ ] Per-user volume control (0–300%) — Discord caps at 200%, users say it's not enough
- [ ] Noise suppression (RNNoise or similar open-source, not Krisp) — must not auto-disable like Discord's does
- [ ] Embedded text chat in voice channels
- [ ] Voice channel status/topic

### 1.3 Server & Channel Structure
- [ ] Server creation with invite links
- [ ] Text channels and voice channels
- [ ] Channel categories with collapsible groups
- [ ] Channel topics and descriptions
- [ ] Server folders for organizing joined servers (users love these)
- [ ] Slow mode with custom intervals (Discord caps at 6 hours; allow arbitrary durations)
- [ ] **Role-specific slow mode** — top Discord request, never implemented

### 1.4 Roles & Permissions
- [ ] Role-based permission system with hierarchy
- [ ] Channel-level permission overrides
- [ ] **Simplified permissions UX** — Discord's permission system is universally called "the most confusing part of server management." Use clear language, visual previews of effective permissions, and a permission debugger
- [ ] Role colors and hoisting in member list

### 1.5 User Accounts & Profiles
- [ ] Registration with email (no phone number required — Discord's phone verification is deeply hated)
- [ ] Username + display name system — support non-Latin characters from day one
- [ ] Per-server nicknames
- [ ] Avatar upload
- [ ] About Me / bio field
- [ ] Custom status with emoji
- [ ] Online/idle/DND/invisible status
- [ ] **Per-server online status** — appear online in gaming servers, invisible in others. Top Discord wishlist item.
- [ ] Pronouns field (visible in chat, not just profile cards — fixing Discord's half-implementation)

### 1.6 Privacy & Security (Day One Differentiators)
- [ ] **E2EE for all text messages by default** (Signal Protocol or MLS) — no competitor does this with Discord-like UX
- [ ] E2EE for voice and video calls
- [ ] Minimal data collection — no activity tracking, no telemetry without opt-in
- [ ] 2FA with TOTP authenticator apps + recovery codes + recovery email (Discord locks users out permanently if they lose codes)
- [ ] Open-source client AND server (AGPL or similar copyleft)
- [ ] Self-hostable with Docker one-liner setup
- [ ] No age verification via face scan or government ID
- [ ] Transparent privacy policy in plain language

### 1.7 Direct Messages
- [ ] 1-on-1 encrypted DMs
- [ ] Group DMs with **25-person limit minimum** (Discord's 10-person cap is their most-complained DM limitation)
- [ ] Message requests from non-friends with DMs-off-by-default (unlike Discord's too-permissive defaults)
- [ ] **Real blocking** — blocked users cannot see your messages, profile, online status, or voice channel presence. Discord's block is widely called "useless and dangerous."

---

## Phase 2: Community & Moderation
*Goal: Make it viable for communities to migrate from Discord. Tools that reduce moderator burnout.*

### 2.1 Community Features
- [ ] Welcome screen with customizable message and recommended channels
- [ ] Onboarding flow with role self-selection — **no minimum channel requirement** (Discord's 7-channel minimum is hated)
- [ ] Announcement channels with cross-server follow/subscribe
- [ ] Forum channels (threaded discussions with tags and sorting) — available to ALL servers, not just "Community" tier
- [ ] Scheduled events with **recurring event support** (Discord's #1 events request)
- [ ] Role-based event visibility
- [ ] Server discovery / directory
- [ ] Server Insights / analytics — available to servers of all sizes, not just 500+ members

### 2.2 Moderation Tools
- [ ] AutoMod with keyword filters, RegEx support, spam detection, mention spam blocking
- [ ] **Image/media content scanning** — Discord's AutoMod can't scan images, a known gap
- [ ] Ban with reason (shown to the banned user and editable after the fact)
- [ ] Kick with reason
- [ ] Timeout (1 minute – 28 days) with reason visible to user and dedicated audit log category
- [ ] Audit logs with full search, filtering, and export
- [ ] **Rate limiting on destructive admin actions** — Discord has no protection against rogue admins mass-banning/deleting
- [ ] Reporting system with **human review and transparent status updates** — Discord's Trust & Safety is their most hated support system (1.4 stars on Trustpilot)
- [ ] Channel-specific permissions for external emoji, stickers, GIFs, and soundboard

### 2.3 Threads (Done Right)
- [ ] Thread creation from any message
- [ ] **No auto-archive** — or at minimum, configurable archive behavior. Discord's auto-archive is the #1 thread complaint.
- [ ] Thread notification controls (watch/mute/default)
- [ ] Bot support in threads from launch
- [ ] Admin controls over thread creation permissions

### 2.4 Enhanced Messaging
- [ ] Pinned messages with **no arbitrary cap** (Discord's 50-pin limit per channel is hated)
- [ ] Pin notifications togglable per channel
- [ ] **Full-text search with exact match / quoted phrases** — Discord's fuzzy search is their #1 text chat complaint (searching "animation" returns "anime")
- [ ] Search filters: by user, channel, date range, has file/link/embed, message type
- [ ] **Message scheduling** — top Discord wishlist item, never implemented
- [ ] Polls with anonymous voting option, unlimited duration, and 20+ answer options
- [ ] Custom emoji with generous limits (100+ base slots) — all users can use animated emoji, no paywall
- [ ] **Sticker/emoji management that doesn't hijack the picker** — Discord's sticker suggestions overriding emoji search is hated

---

## Phase 3: Voice, Video & Streaming
*Goal: Full real-time communication parity with Discord, without quality paywalls.*

### 3.1 Video & Screen Sharing
- [ ] Video calls in voice channels and DMs
- [ ] Screen sharing (full screen + individual window)
- [ ] **1080p/60fps streaming for ALL users** — Discord paywalls this behind Nitro. Make it free.
- [ ] **Reliable audio capture in screen share** — Discord's browser/Mac audio sharing has been broken for years
- [ ] No quality degradation based on the worst viewer's connection (Discord adapts stream quality to the slowest viewer)
- [ ] Go Live–style game streaming with up to 50 viewers

### 3.2 Stage Channels
- [ ] Speaker/audience separation with hand-raising
- [ ] Moderator notifications for raised hands (Discord doesn't do this)
- [ ] Screen sharing and video in stage channels
- [ ] Configurable bitrate (Discord's stages launched at unusable ~40kbps)

### 3.3 Audio Quality
- [ ] **128kbps minimum for all voice channels, free** — Discord's 96kbps free tier is widely criticized
- [ ] Up to 384kbps without any paywall (Discord gates this behind $1,000+/year in boosts)
- [ ] Opus codec throughout
- [ ] Echo cancellation that doesn't distort voice quality

### 3.4 Soundboard
- [ ] Custom sound clips in voice channels (up to 5 seconds)
- [ ] Per-channel soundboard permissions
- [ ] **Client-side soundboard mute** from day one (Discord launched without this)
- [ ] Soundboard volume separate from voice volume

### 3.5 Watch Together
- [ ] Synchronized video watching in voice channels
- [ ] YouTube integration (or open alternative like Invidious/Piped for privacy)
- [ ] Shared playback controls

---

## Phase 4: Ecosystem & Extensibility
*Goal: Build the developer ecosystem that makes the platform sticky.*

### 4.1 Bot Framework & API
- [ ] REST API + WebSocket gateway for real-time events
- [ ] **Developer-friendly documentation** — Discord's docs are notoriously incomplete. Make this best-in-class.
- [ ] Slash commands with autocomplete
- [ ] **Keep prefix commands** — Discord's forced migration to slash-only was highly divisive. Support both.
- [ ] Message components (buttons, select menus, modals)
- [ ] Webhooks for simple integrations (GitHub, CI/CD, RSS)
- [ ] **No government ID for bot verification** — Discord's ID requirement for bots >75 servers is hated by student and privacy-conscious developers
- [ ] Reasonable rate limits with clear documentation and graceful degradation (not Discord's undocumented hard disconnects)
- [ ] Official SDKs: Python, JavaScript/TypeScript, Rust, Go

### 4.2 Integrations & Bridges
- [ ] Discord bridge (so users can talk to Discord friends during migration — critical for adoption)
- [ ] Matrix bridge (interoperability with the federated ecosystem)
- [ ] GitHub, GitLab webhook templates
- [ ] Calendar integration (Google Calendar, CalDAV)
- [ ] Spotify/music listening status (opt-in only)

### 4.3 Activities
- [ ] Embedded app framework for games and tools in voice channels
- [ ] First-party activities: whiteboard, watch party, simple games
- [ ] Developer SDK for custom activities

---

## Phase 5: Platform Polish & Missing Features
*Goal: Ship the quality-of-life features Discord has ignored for years.*

### 5.1 Notifications (Fix Discord's Biggest UX Failure)
- [ ] **Custom notification sounds per server and per channel** — 4+ years of Discord requests, never implemented. Universally cited as "the one feature that would get me to pay for Nitro."
- [ ] Reliable mobile push notifications (Discord's are notoriously broken after every update)
- [ ] Per-user notification priority within servers
- [ ] Notification summary/digest mode

### 5.2 Mobile App
- [ ] Native iOS and Android apps (NOT React Native — Discord's RN migration caused battery, performance, and UI issues)
- [ ] **Full feature parity with desktop** — Discord's widening mobile/desktop gap is a top complaint
- [ ] Tablet-optimized layouts (Discord's iPad app is just a stretched phone app)
- [ ] Proper mobile search (server-wide, not channel-limited like Discord's broken mobile search)
- [ ] AMOLED dark mode on mobile AND desktop

### 5.3 Accessibility
- [ ] Full keyboard navigation
- [ ] Screen reader support (NVDA, JAWS, VoiceOver, TalkBack) — test thoroughly, unlike Discord's broken mobile VoiceOver
- [ ] Configurable font sizes on all platforms
- [ ] Compact mode that's actually compact
- [ ] Reduced motion mode synced with OS preferences
- [ ] Color blind mode with icon indicators AND client-side color overrides for role colors
- [ ] **No CAPTCHA that blocks screen readers** (Discord's HCaptcha locked out blind users)

### 5.4 Customization & Themes
- [ ] **Official theme support with theme marketplace** — 3,000+ BetterDiscord themes prove massive demand. Don't make users violate ToS for appearance changes.
- [ ] Dark mode, light mode, AMOLED mode built-in
- [ ] Custom CSS for power users (officially supported, not bannable)
- [ ] UI density options (cozy, compact, ultra-compact)

### 5.5 Data Ownership & Export
- [ ] **Full chat export** (JSON, HTML, plaintext) — Discord doesn't allow this; users rely on ToS-violating third-party tools
- [ ] Server backup and restore
- [ ] Account data download (GDPR-style, available to everyone)
- [ ] **Offline mode** — view previously loaded messages without internet. Discord requires connectivity for everything.
- [ ] Account switching between multiple accounts (Discord has hidden this in experiments for years)
- [ ] **Built-in translation** — auto-translate messages inline. Discord has 30+ interface languages but no message translation.

---

## Phase 6: Monetization (Sustainable, Not Exploitative)
*Goal: Fund development without paywalling communication features.*

### 6.1 Guiding Principles
- Voice quality, file uploads, streaming quality, and search are **NEVER paywalled**
- All cosmetic features achievable through free means (no animated emoji paywall)
- Transparent pricing tied to infrastructure costs
- Open-source core is always free and self-hostable

### 6.2 Revenue Streams
- [ ] **Managed hosting** — one-click deploy for communities that don't want to self-host. Tiered by member count and storage.
- [ ] **Optional cosmetic subscription** — profile effects, animated avatars, extended upload storage, exclusive themes. Priced at $3–5/month (vs Discord's $10/month)
- [ ] **Server monetization tools** — let server owners offer paid tiers, taking ≤10% (matching Discord's 90/10 split)
- [ ] **Enterprise tier** — SSO/SAML, audit compliance, priority support, SLA for organizations
- [ ] Donate button / community funding visibility

### 6.3 What's Free Forever
- 128kbps+ voice in all channels
- 1080p/60fps screen sharing and streaming
- 25MB+ file uploads
- Full search with all operators
- Unlimited custom emoji (animated included)
- All moderation tools
- E2EE everywhere
- Self-hosting

---

## Cross-Cutting Concerns (All Phases)

### Performance
- Target <100ms message delivery latency
- Voice latency competitive with Mumble (<30ms)
- Lightweight client — Discord's Electron app is a known resource hog. Consider Tauri or native.
- Mobile battery optimization (Discord drains "100% to 10% in 4 hours" on some devices)

### Tech Stack Considerations
- **Backend:** Rust or Go (performance + safety)
- **Client:** Tauri for desktop (vs Discord's heavy Electron), Flutter or native for mobile
- **Voice/Video:** WebRTC with open-source SFU (LiveKit or Janus) for group calls
- **E2EE:** MLS protocol (IETF standard) or Signal Protocol adaptation
- **Database:** PostgreSQL + ScyllaDB for message storage
- **Self-hosting:** Docker Compose one-liner, Helm charts for Kubernetes

### UI/UX Principles
- **Never force UI changes** — offer opt-in betas and legacy mode. Discord's forced redesigns are a top complaint.
- Discord-familiar layout (server sidebar → channel list → chat → member list) to minimize migration friction
- Respect user muscle memory — don't move buttons for the sake of change
- Clean, neutral aesthetic that works for gaming AND professional communities

---

## Priority Matrix: What to Build First

| Priority | Feature | Why |
|----------|---------|-----|
| **P0 — Ship or die** | Text messaging, voice channels, E2EE, roles/permissions, DMs | Core loop. Without these, nothing else matters. |
| **P1 — Migration enablers** | Discord bridge, search, file sharing (25MB+), server folders, custom emoji | People won't switch if they lose these. |
| **P2 — Differentiators** | Real blocking, per-server status, custom notification sounds, no phone verification, generous free tier | Things Discord users actively want that Discord won't build. |
| **P3 — Community scale** | AutoMod, forum channels, events, threads, onboarding | Needed once communities grow past ~50 members. |
| **P4 — Ecosystem** | Bot API, webhooks, activities, app directory | Makes the platform self-sustaining. |
| **P5 — Polish** | Themes, translation, offline mode, export, mobile parity | Retention and long-term satisfaction. |
