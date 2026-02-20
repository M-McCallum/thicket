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
  | 'SESSION_EXPIRED'

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
  created_at: string
  username: string
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
  created_at: string
  username: string
}

export interface TokenRefreshData {
  token: string
}
