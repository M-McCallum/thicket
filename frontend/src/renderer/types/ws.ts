export type WSEventType =
  // Client → Server
  | 'IDENTIFY'
  | 'HEARTBEAT'
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'TYPING_START'
  | 'PRESENCE_UPDATE'
  | 'TOKEN_REFRESH'
  // Server → Client
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
