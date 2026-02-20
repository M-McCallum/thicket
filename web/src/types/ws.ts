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
  created_at: string
  username: string
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
