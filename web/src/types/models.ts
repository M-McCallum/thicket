export interface User {
  id: string
  username: string
  email: string
  avatar_url: string | null
  display_name: string | null
  status: 'online' | 'idle' | 'dnd' | 'offline'
  bio: string
  pronouns: string
  custom_status_text: string
  custom_status_emoji: string
  custom_status_expires_at: string | null
  created_at: string
}

export interface Server {
  id: string
  name: string
  icon_url: string | null
  owner_id: string
  invite_code: string
  is_public?: boolean
  description?: string
  gifs_enabled?: boolean
  welcome_message: string
  welcome_channels: string[]
  created_at: string
}

export interface ServerInvite {
  id: string
  server_id: string
  creator_id: string
  code: string
  max_uses: number | null
  uses: number
  expires_at: string | null
  created_at: string
}

export interface PublicServer {
  id: string
  name: string
  icon_url: string | null
  description: string
  member_count: number
  is_public: boolean
}

export interface Channel {
  id: string
  server_id: string
  name: string
  type: 'text' | 'voice' | 'forum'
  position: number
  topic: string
  category_id: string | null
  slow_mode_interval: number
  voice_status: string
  is_announcement: boolean
  created_at: string
}

export interface ChannelFollow {
  id: string
  source_channel_id: string
  target_channel_id: string
  created_by: string
  created_at: string
}

export interface ChannelCategory {
  id: string
  server_id: string
  name: string
  position: number
  created_at: string
}

export interface Attachment {
  id: string
  filename: string
  original_filename: string
  content_type: string
  size: number
  width?: number
  height?: number
  url: string
  is_external: boolean
}

export interface ReplySnippet {
  id: string
  author_id: string
  author_username: string
  content: string
}

export interface ReactionCount {
  emoji: string
  count: number
  me: boolean
}

export interface Message {
  id: string
  channel_id: string
  author_id: string
  content: string
  type?: 'text' | 'sticker' | 'poll'
  reply_to_id?: string | null
  reply_to?: ReplySnippet | null
  reactions?: ReactionCount[]
  created_at: string
  updated_at: string
  author_username?: string
  author_display_name?: string | null
  author_avatar_url?: string | null
  attachments?: Attachment[]
  poll?: PollWithOptions | null
}

export interface ServerMember {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  status: string
  role: 'owner' | 'admin' | 'member'
  nickname: string | null
  roles?: Role[]
}

export interface DMConversation {
  id: string
  is_group: boolean
  name: string | null
  accepted: boolean
  created_at: string
}

export interface DMReplySnippet {
  id: string
  author_id: string
  author_username: string
  content: string
}

export interface DMReactionCount {
  emoji: string
  count: number
  me: boolean
}

export interface DMMessage {
  id: string
  conversation_id: string
  author_id: string
  content: string
  type?: 'text' | 'sticker' | 'poll'
  reply_to_id?: string | null
  reply_to?: DMReplySnippet | null
  reactions?: DMReactionCount[]
  created_at: string
  updated_at: string
  author_username?: string
  author_display_name?: string | null
  author_avatar_url?: string | null
  attachments?: Attachment[]
}

export interface DMMessageEdit {
  id: string
  dm_message_id: string
  content: string
  edited_at: string
}

export interface DMParticipant {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  status: string
}

export interface DMConversationWithParticipants extends DMConversation {
  participants: DMParticipant[]
}

export interface CustomEmoji {
  id: string
  server_id: string
  name: string
  url: string
  creator_id: string
  created_at: string
}

export interface StickerPack {
  id: string
  name: string
  description?: string
  server_id?: string
  creator_id: string
  created_at: string
}

export interface Sticker {
  id: string
  pack_id: string
  name: string
  url: string
  created_at: string
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined' | 'blocked'
  username: string
  display_name: string | null
  avatar_url: string | null
  user_status: string
  created_at: string
  updated_at: string
}

export interface ServerPreview {
  name: string
  member_count: number
  icon_url: string | null
}

export interface Role {
  id: string
  server_id: string
  name: string
  color: string | null
  position: number
  permissions: string // int64 serialized as string
  hoist: boolean
  created_at: string
}

export interface ChannelPermissionOverride {
  id: string
  channel_id: string
  role_id: string
  allow: string // int64 serialized as string
  deny: string // int64 serialized as string
}

export interface MemberWithRoles extends ServerMember {
  roles: Role[]
}

export interface MessageEdit {
  id: string
  message_id: string
  content: string
  edited_at: string
}

export interface ServerFolder {
  id: string
  name: string
  color: string
  position: number
  server_ids: string[]
}

export interface LinkPreview {
  id: string
  url: string
  title: string | null
  description: string | null
  image_url: string | null
  site_name: string | null
  fetched_at: string
}

export interface ScheduledMessage {
  id: string
  channel_id: string | null
  dm_conversation_id: string | null
  author_id: string
  content: string
  type: string
  scheduled_at: string
  sent: boolean
  created_at: string
}

export interface NotificationPref {
  id: string
  user_id: string
  server_id: string | null
  channel_id: string | null
  notification_level: 'all' | 'mentions' | 'none'
  created_at: string
  updated_at: string
}

// Scheduled Events
export interface ServerEvent {
  id: string
  server_id: string
  creator_id: string
  name: string
  description: string
  location_type: 'voice' | 'stage' | 'external'
  channel_id: string | null
  external_location: string
  start_time: string
  end_time: string | null
  image_url: string | null
  status: 'scheduled' | 'active' | 'completed' | 'cancelled'
  created_at: string
  interested_count: number
  user_rsvp: string | null
  creator_username: string
}

export interface EventRSVP {
  event_id: string
  user_id: string
  status: 'interested' | 'going'
}

// Polls
export interface PollOption {
  id: string
  poll_id: string
  text: string
  emoji: string
  position: number
  vote_count: number
  voted: boolean
}

export interface PollWithOptions {
  id: string
  message_id: string | null
  question: string
  multi_select: boolean
  anonymous: boolean
  expires_at: string | null
  created_at: string
  options: PollOption[]
  total_votes: number
}

export interface Thread {
  id: string
  channel_id: string
  parent_message_id: string
  name: string
  creator_id: string
  archived: boolean
  locked: boolean
  auto_archive_minutes: number
  message_count: number
  last_message_at: string | null
  created_at: string
}

export interface ThreadMessage {
  id: string
  thread_id: string
  author_id: string
  content: string
  reply_to_id: string | null
  created_at: string
  updated_at: string | null
  author_username: string
  author_display_name: string | null
  author_avatar_url: string | null
}

export interface ThreadSubscription {
  thread_id: string
  user_id: string
  notification_level: string
}

export interface ServerBan {
  id: string
  server_id: string
  user_id: string
  banned_by: string
  reason: string
  created_at: string
  username?: string
  display_name?: string | null
  avatar_url?: string | null
}

export interface ServerTimeout {
  id: string
  server_id: string
  user_id: string
  timed_out_by: string
  reason: string
  expires_at: string
  created_at: string
  username?: string
  display_name?: string | null
  avatar_url?: string | null
}

export interface AuditLogEntry {
  id: string
  server_id: string
  actor_id: string
  action: string
  target_id: string | null
  target_type: string | null
  changes: Record<string, unknown> | null
  reason: string
  created_at: string
  actor_username?: string
}

// Forum channels (WP16)
export interface ForumTag {
  id: string
  channel_id: string
  name: string
  color: string
  emoji: string
  position: number
  moderated: boolean
  created_at: string
}

export interface ForumPost {
  id: string
  channel_id: string
  author_id: string
  title: string
  pinned: boolean
  created_at: string
  updated_at: string
  author_username: string
  author_display_name: string | null
  author_avatar_url: string | null
  tags: ForumTag[]
  reply_count: number
  last_activity_at: string
  content_preview: string
}

export interface ForumPostMessage {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
  updated_at: string
  author_username: string
  author_display_name: string | null
  author_avatar_url: string | null
}

// Welcome & Onboarding (WP20)
export interface WelcomeConfig {
  welcome_message: string
  welcome_channels: string[]
}

export interface OnboardingOption {
  id: string
  prompt_id: string
  label: string
  description: string
  emoji: string
  role_ids: string[]
  channel_ids: string[]
  position: number
}

export interface OnboardingPrompt {
  id: string
  server_id: string
  title: string
  description: string
  required: boolean
  position: number
  created_at: string
  options: OnboardingOption[]
}

// AutoMod (WP31)
export interface AutoModRule {
  id: string
  server_id: string
  name: string
  type: 'keyword' | 'regex' | 'spam' | 'invite_links' | 'mention_spam'
  trigger_data: Record<string, unknown>
  action: 'delete' | 'timeout' | 'alert'
  action_metadata: Record<string, unknown>
  enabled: boolean
  exempt_roles: string[]
  exempt_channels: string[]
  created_at: string
  updated_at: string
}
