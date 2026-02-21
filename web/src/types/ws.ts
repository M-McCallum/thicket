import type { Attachment } from './models'

export type WSEventType =
  // Client -> Server
  | 'IDENTIFY'
  | 'HEARTBEAT'
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'TYPING_START'
  | 'PRESENCE_UPDATE'
  | 'TOKEN_REFRESH'
  | 'VOICE_JOIN'
  | 'VOICE_LEAVE'
  | 'DM_CALL_START'
  | 'DM_CALL_ACCEPT'
  | 'DM_CALL_END'
  // Server -> Client
  | 'READY'
  | 'HEARTBEAT_ACK'
  | 'MESSAGE_CREATE'
  | 'MESSAGE_UPDATE'
  | 'MESSAGE_DELETE'
  | 'CHANNEL_CREATE'
  | 'CHANNEL_UPDATE'
  | 'CHANNEL_DELETE'
  | 'MEMBER_JOIN'
  | 'MEMBER_LEAVE'
  | 'VOICE_STATE_UPDATE'
  | 'DM_MESSAGE_CREATE'
  | 'USER_PROFILE_UPDATE'
  | 'SESSION_EXPIRED'
  | 'FRIEND_REQUEST_CREATE'
  | 'FRIEND_REQUEST_ACCEPT'
  | 'FRIEND_REMOVE'
  | 'DM_CALL_RING'
  | 'DM_CALL_ACCEPT'
  | 'DM_CALL_END'
  | 'SERVER_UPDATE'
  | 'MEMBER_UPDATE'
  | 'CATEGORY_CREATE'
  | 'CATEGORY_UPDATE'
  | 'CATEGORY_DELETE'
  | 'MESSAGE_PIN'
  | 'MESSAGE_UNPIN'
  | 'REACTION_ADD'
  | 'REACTION_REMOVE'
  | 'ROLE_CREATE'
  | 'ROLE_UPDATE'
  | 'ROLE_DELETE'
  | 'MEMBER_ROLE_UPDATE'
  | 'THREAD_CREATE'
  | 'THREAD_UPDATE'
  | 'THREAD_MESSAGE_CREATE'
  | 'EVENT_CREATE'
  | 'EVENT_UPDATE'
  | 'EVENT_DELETE'
  | 'POLL_CREATE'
  | 'POLL_VOTE'
  | 'MENTION_CREATE'
  | 'UNREAD_UPDATE'
  | 'DM_PARTICIPANT_ADD'
  | 'DM_PARTICIPANT_REMOVE'
  | 'DM_CONVERSATION_UPDATE'
  | 'DM_MESSAGE_UPDATE'
  | 'DM_MESSAGE_DELETE'
  | 'DM_REACTION_ADD'
  | 'DM_REACTION_REMOVE'
  | 'DM_MESSAGE_PIN'
  | 'DM_MESSAGE_UNPIN'
  | 'NOTIFICATION'

export interface WSEvent<T = unknown> {
  type: WSEventType
  data?: T
}

export interface IdentifyData {
  token: string
}

export interface SubscribeData {
  channel_id: string
}

export interface TypingData {
  channel_id: string
  user_id: string
  username: string
}

export interface PresenceData {
  user_id: string
  username: string
  status: string
}

export interface MessageCreateData {
  id: string
  channel_id: string
  author_id: string
  content: string
  type?: string
  reply_to_id?: string | null
  reply_to?: { id: string; author_id: string; author_username: string; content: string } | null
  created_at: string
  username: string
  author_avatar_url?: string | null
  author_display_name?: string | null
  attachments?: Attachment[]
}

export interface MessageDeleteData {
  id: string
  channel_id: string
}

export interface MessageUpdateData {
  id: string
  channel_id: string
  author_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface ChannelCreateData {
  id: string
  server_id: string
  name: string
  type: 'text' | 'voice' | 'forum'
  position: number
  topic: string
  category_id: string | null
  slow_mode_interval?: number
  voice_status: string
  is_announcement: boolean
  created_at: string
}

export interface ChannelDeleteData {
  id: string
  server_id: string
}

export interface MemberJoinData {
  server_id: string
  user_id: string
  username: string
}

export interface MemberLeaveData {
  server_id: string
  user_id: string
}

export interface ReadyData {
  user_id: string
  username: string
  online_user_ids: string[]
}

export interface VoiceStateData {
  user_id: string
  username: string
  channel_id: string
  server_id: string
  joined: boolean
  muted: boolean
  deafened: boolean
}

export interface DMMessageCreateData {
  id: string
  conversation_id: string
  author_id: string
  content: string
  type?: string
  created_at: string
  username: string
  author_avatar_url?: string | null
  author_display_name?: string | null
  attachments?: Attachment[]
}

export interface UserProfileUpdateData {
  id: string
  username: string
  avatar_url: string | null
  display_name: string | null
  status: string
  bio: string
  pronouns: string
  custom_status_text: string
  custom_status_emoji: string
  custom_status_expires_at: string | null
}

export interface TokenRefreshData {
  token: string
}

export interface FriendRequestCreateData {
  id: string
  requester_id: string
  addressee_id: string
  status: string
  username: string
}

export interface FriendRequestAcceptData {
  id: string
  user_id: string
  username: string
}

export interface FriendRemoveData {
  id: string
  user_id: string
}

export interface DMCallRingData {
  conversation_id: string
  caller_id: string
  caller_username: string
}

export interface DMCallAcceptData {
  conversation_id: string
  user_id: string
  username: string
}

export interface DMCallEndData {
  conversation_id: string
  user_id: string
}

export interface ServerUpdateData {
  id: string
  name: string
  icon_url: string | null
  owner_id: string
  invite_code: string
  welcome_message: string
  welcome_channels: string[]
  created_at: string
  updated_at: string
}

export interface MemberUpdateData {
  server_id: string
  user_id: string
  nickname: string | null
}

export interface CategoryCreateData {
  id: string
  server_id: string
  name: string
  position: number
  created_at: string
}

export interface CategoryUpdateData {
  id: string
  server_id: string
  name: string
  position: number
  created_at: string
}

export interface CategoryDeleteData {
  id: string
  server_id: string
}

export interface MessagePinData {
  channel_id: string
  message_id: string
  pinned_by: string
}

export interface MessageUnpinData {
  channel_id: string
  message_id: string
}

export interface ReactionAddData {
  message_id: string
  channel_id: string
  user_id: string
  emoji: string
}

export interface ReactionRemoveData {
  message_id: string
  channel_id: string
  user_id: string
  emoji: string
}

export interface RoleCreateData {
  id: string
  server_id: string
  name: string
  color: string | null
  position: number
  permissions: string
  hoist: boolean
  created_at: string
}

export interface RoleUpdateData {
  id: string
  server_id: string
  name: string
  color: string | null
  position: number
  permissions: string
  hoist: boolean
  created_at: string
}

export interface RoleDeleteData {
  id: string
  server_id: string
}

export interface MemberRoleUpdateData {
  server_id: string
  user_id: string
  role_id: string
  action: 'assign' | 'remove'
}

export interface MentionCreateData {
  channel_id: string
  message_id: string
  author_id: string
  content: string
  username: string
}

export interface UnreadUpdateData {
  channel_id: string
  count: number
}

export interface DMParticipantAddData {
  conversation_id: string
  user_id: string
  added_by: string
}

export interface DMParticipantRemoveData {
  conversation_id: string
  user_id: string
  removed_by: string
}

export interface DMConversationUpdateData {
  conversation_id: string
  name: string
}

export interface DMMessageUpdateData {
  id: string
  conversation_id: string
  author_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface DMMessageDeleteData {
  id: string
  conversation_id: string
}

export interface DMReactionAddData {
  message_id: string
  conversation_id: string
  user_id: string
  emoji: string
}

export interface DMReactionRemoveData {
  message_id: string
  conversation_id: string
  user_id: string
  emoji: string
}

export interface DMMessagePinData {
  conversation_id: string
  message_id: string
  pinned_by: string
}

export interface DMMessageUnpinData {
  conversation_id: string
  message_id: string
}

export interface NotificationData {
  type: string
  channel_id: string
  server_id: string
  message_id: string
  author_id: string
  username: string
  content: string
  created_at: string
}

export interface ThreadCreateData {
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

export interface ThreadUpdateData {
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

export interface ThreadMessageCreateData {
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
  channel_id: string
  message_count: number
}

export interface EventCreateData {
  id: string
  server_id: string
  creator_id: string
  name: string
  description: string
  location_type: string
  channel_id: string | null
  external_location: string
  start_time: string
  end_time: string | null
  image_url: string | null
  status: string
  created_at: string
}

export interface EventUpdateData {
  id: string
  server_id: string
  rsvp?: boolean
}

export interface EventDeleteData {
  id: string
  server_id: string
}

export interface PollCreateData {
  id: string
  message_id: string | null
  question: string
  multi_select: boolean
  anonymous: boolean
  expires_at: string | null
  created_at: string
  options: {
    id: string
    poll_id: string
    text: string
    emoji: string
    position: number
    vote_count: number
    voted: boolean
  }[]
  total_votes: number
}

export interface PollVoteData {
  id: string
  message_id: string | null
  question: string
  multi_select: boolean
  anonymous: boolean
  expires_at: string | null
  created_at: string
  options: {
    id: string
    poll_id: string
    text: string
    emoji: string
    position: number
    vote_count: number
    voted: boolean
  }[]
  total_votes: number
}
