export interface AuthResponse {
  user: {
    id: string
    username: string
    email: string
    display_name: string | null
    avatar_url: string | null
    status: string
  }
  access_token: string
  refresh_token: string
}

export interface RefreshResponse {
  access_token: string
  refresh_token: string
}

export interface SignupRequest {
  username: string
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface CreateServerRequest {
  name: string
}

export interface JoinServerRequest {
  invite_code: string
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
