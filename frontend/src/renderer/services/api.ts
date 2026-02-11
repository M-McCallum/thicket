import type {
  AuthResponse,
  RefreshResponse,
  SignupRequest,
  LoginRequest,
  CreateServerRequest,
  JoinServerRequest,
  CreateChannelRequest,
  SendMessageRequest,
  CreateDMConversationRequest,
  SendDMRequest
} from '../types/api'
import type { Server, Channel, Message, ServerMember, DMConversationWithParticipants, DMMessage } from '../types/models'

const API_BASE = 'http://localhost:8080/api'

let accessToken: string | null = null
let refreshToken: string | null = null
let onTokenRefresh: ((tokens: { accessToken: string; refreshToken: string }) => void) | null = null

export function setTokens(access: string, refresh: string): void {
  accessToken = access
  refreshToken = refresh
}

export function clearTokens(): void {
  accessToken = null
  refreshToken = null
}

export function setOnTokenRefresh(
  cb: (tokens: { accessToken: string; refreshToken: string }) => void
): void {
  onTokenRefresh = cb
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  })

  if (response.status === 401 && retry && refreshToken) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      return request<T>(path, options, false)
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new ApiError(error.error || 'Unknown error', response.status)
  }

  return response.json()
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    })

    if (!response.ok) return false

    const data: RefreshResponse = await response.json()
    accessToken = data.access_token
    refreshToken = data.refresh_token
    onTokenRefresh?.({ accessToken: data.access_token, refreshToken: data.refresh_token })
    return true
  } catch {
    return false
  }
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Auth
export const auth = {
  signup: (data: SignupRequest) =>
    request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  login: (data: LoginRequest) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  logout: () =>
    request<{ message: string }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken })
    }),

  me: () => request<{ user_id: string; username: string }>('/me')
}

// Servers
export const servers = {
  list: () => request<Server[]>('/servers'),

  get: (id: string) => request<Server>(`/servers/${id}`),

  create: (data: CreateServerRequest) =>
    request<{ server: Server; channel: Channel }>('/servers', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  join: (data: JoinServerRequest) =>
    request<Server>('/servers/join', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  leave: (id: string) =>
    request<{ message: string }>(`/servers/${id}/leave`, { method: 'POST' }),

  delete: (id: string) =>
    request<{ message: string }>(`/servers/${id}`, { method: 'DELETE' }),

  members: (id: string) => request<ServerMember[]>(`/servers/${id}/members`)
}

// Channels
export const channels = {
  list: (serverId: string) => request<Channel[]>(`/servers/${serverId}/channels`),

  create: (serverId: string, data: CreateChannelRequest) =>
    request<Channel>(`/servers/${serverId}/channels`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
}

// Messages
export const messages = {
  list: (channelId: string, before?: string, limit?: number) => {
    const params = new URLSearchParams()
    if (before) params.set('before', before)
    if (limit) params.set('limit', String(limit))
    const query = params.toString()
    return request<Message[]>(`/channels/${channelId}/messages${query ? `?${query}` : ''}`)
  },

  send: (channelId: string, data: SendMessageRequest) =>
    request<Message>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  update: (id: string, content: string) =>
    request<Message>(`/messages/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    }),

  delete: (id: string) =>
    request<{ message: string }>(`/messages/${id}`, { method: 'DELETE' })
}

// Direct Messages
export const dm = {
  createConversation: (data: CreateDMConversationRequest) =>
    request<DMConversationWithParticipants>('/dm/conversations', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  listConversations: () =>
    request<DMConversationWithParticipants[]>('/dm/conversations'),

  getMessages: (conversationId: string, before?: string, limit?: number) => {
    const params = new URLSearchParams()
    if (before) params.set('before', before)
    if (limit) params.set('limit', String(limit))
    const query = params.toString()
    return request<DMMessage[]>(`/dm/conversations/${conversationId}/messages${query ? `?${query}` : ''}`)
  },

  sendMessage: (conversationId: string, data: SendDMRequest) =>
    request<DMMessage>(`/dm/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
}
