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
  type: 'text' | 'voice'
  position: number
  topic: string
  category_id: string | null
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
