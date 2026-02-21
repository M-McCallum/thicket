export interface CreateServerRequest {
  name: string
}

export interface JoinServerRequest {
  invite_code?: string
  server_id?: string
}

export interface CreateChannelRequest {
  name: string
  type: 'text' | 'voice'
}

export interface SendMessageRequest {
  content: string
}

export interface CreateDMConversationRequest {
  participant_id: string
}

export interface SendDMRequest {
  content: string
}

export interface OAuthTokens {
  access_token: string
  refresh_token: string | null
  id_token: string | null
  expires_at: number | null
}

export interface ApiError {
  error: string
}
