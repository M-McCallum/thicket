import type {
  CreateServerRequest,
  JoinServerRequest,
  CreateChannelRequest,
  SendMessageRequest,
  CreateDMConversationRequest,
  SendDMRequest
} from '@/types/api'
import type {
  Server, Channel, Message, ServerMember,
  DMConversationWithParticipants, DMMessage, User,
  CustomEmoji, StickerPack, Sticker, Friendship, ServerPreview
} from '@/types/models'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'

let accessToken: string | null = null
let refreshToken: string | null = null
let oauthRefreshHandler: (() => Promise<boolean>) | null = null

export function setTokens(access: string, refresh: string): void {
  accessToken = access
  refreshToken = refresh
}

export function clearTokens(): void {
  accessToken = null
  refreshToken = null
}

export function setOAuthRefreshHandler(handler: () => Promise<boolean>): void {
  oauthRefreshHandler = handler
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
  if (!oauthRefreshHandler) return false
  try {
    return await oauthRefreshHandler()
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

async function requestMultipart<T>(
  path: string,
  formData: FormData,
  retry = true
): Promise<T> {
  const headers: Record<string, string> = {}
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData
  })

  if (response.status === 401 && retry && refreshToken) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      return requestMultipart<T>(path, formData, false)
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new ApiError(error.error || 'Unknown error', response.status)
  }

  return response.json()
}

// Auth
export const auth = {
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
  send: (channelId: string, content: string, files?: File[], msgType?: string) => {
    if (files && files.length > 0) {
      const fd = new FormData()
      fd.append('content', content)
      if (msgType) fd.append('type', msgType)
      files.forEach((f) => fd.append('files', f))
      return requestMultipart<Message>(`/channels/${channelId}/messages`, fd)
    }
    return request<Message>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, type: msgType })
    })
  },
  update: (id: string, content: string) =>
    request<Message>(`/messages/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/messages/${id}`, { method: 'DELETE' })
}

// Voice
export const voice = {
  getToken: (serverId: string, channelId: string) =>
    request<{ token: string; room: string }>(
      `/servers/${serverId}/channels/${channelId}/voice-token`,
      { method: 'POST' }
    )
}

// Channels (extended)
export const channelsApi = {
  delete: (serverId: string, channelId: string) =>
    request<{ message: string }>(`/servers/${serverId}/channels/${channelId}`, {
      method: 'DELETE'
    })
}

// Profile
export const profile = {
  get: () => request<User>('/me/profile'),
  update: (data: { display_name?: string; bio?: string; pronouns?: string }) =>
    request<User>('/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  updateStatus: (status: string) =>
    request<{ status: string }>('/me/status', {
      method: 'PUT',
      body: JSON.stringify({ status })
    }),
  updateCustomStatus: (data: { text: string; emoji: string; expires_in?: string }) =>
    request<User>('/me/custom-status', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  uploadAvatar: (file: File) => {
    const formData = new FormData()
    formData.append('avatar', file)
    return requestMultipart<User>('/me/avatar', formData)
  },
  deleteAvatar: () =>
    request<User>('/me/avatar', { method: 'DELETE' }),
  getPublic: (userId: string) =>
    request<User>(`/users/${userId}/profile`)
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
  sendMessage: (conversationId: string, content: string, files?: File[], msgType?: string) => {
    if (files && files.length > 0) {
      const fd = new FormData()
      fd.append('content', content)
      if (msgType) fd.append('type', msgType)
      files.forEach((f) => fd.append('files', f))
      return requestMultipart<DMMessage>(`/dm/conversations/${conversationId}/messages`, fd)
    }
    return request<DMMessage>(`/dm/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, type: msgType })
    })
  },
  getVoiceToken: (conversationId: string) =>
    request<{ token: string; room: string }>(
      `/dm/conversations/${conversationId}/voice-token`,
      { method: 'POST' }
    )
}

// Custom Emojis
export const emojis = {
  list: (serverId: string) =>
    request<CustomEmoji[]>(`/servers/${serverId}/emojis`),
  create: (serverId: string, name: string, file: File) => {
    const fd = new FormData()
    fd.append('name', name)
    fd.append('image', file)
    return requestMultipart<CustomEmoji>(`/servers/${serverId}/emojis`, fd)
  },
  delete: (serverId: string, emojiId: string) =>
    request<{ message: string }>(`/servers/${serverId}/emojis/${emojiId}`, {
      method: 'DELETE'
    })
}

// GIFs (GIPHY)
export const gifs = {
  search: (q: string, limit = 20, offset = 0) => {
    const params = new URLSearchParams({ q, limit: String(limit), offset: String(offset) })
    return request<{ data: GifResult[] }>(`/gifs/search?${params}`)
  },
  trending: (limit = 20, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    return request<{ data: GifResult[] }>(`/gifs/trending?${params}`)
  }
}

export interface GifResult {
  id: string
  title: string
  images: {
    original: { url: string; width: string; height: string }
    fixed_width_small: { url: string; width: string; height: string }
    fixed_width: { url: string; width: string; height: string }
  }
}

// Stickers
export const stickers = {
  getPacks: () => request<StickerPack[]>('/sticker-packs'),
  getStickers: (packId: string) =>
    request<Sticker[]>(`/sticker-packs/${packId}/stickers`),
  createPack: (serverId: string, name: string, description?: string) =>
    request<StickerPack>(`/servers/${serverId}/sticker-packs`, {
      method: 'POST',
      body: JSON.stringify({ name, description })
    }),
  createSticker: (packId: string, name: string, file: File) => {
    const fd = new FormData()
    fd.append('name', name)
    fd.append('image', file)
    return requestMultipart<Sticker>(`/sticker-packs/${packId}/stickers`, fd)
  },
  delete: (stickerId: string) =>
    request<{ message: string }>(`/stickers/${stickerId}`, { method: 'DELETE' })
}

// Friends
export const friends = {
  list: () => request<Friendship[]>('/friends'),
  requests: () => request<Friendship[]>('/friends/requests'),
  sendRequest: (username: string) =>
    request<Friendship>('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ username })
    }),
  accept: (id: string) =>
    request<{ message: string }>(`/friends/${id}/accept`, { method: 'POST' }),
  decline: (id: string) =>
    request<{ message: string }>(`/friends/${id}/decline`, { method: 'POST' }),
  remove: (id: string) =>
    request<{ message: string }>(`/friends/${id}`, { method: 'DELETE' })
}

// Server invite preview (public)
export const invites = {
  preview: (code: string) =>
    request<ServerPreview>(`/servers/invite/${code}/preview`)
}
