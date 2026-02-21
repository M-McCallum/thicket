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
  CustomEmoji, Friendship, ServerPreview,
  ChannelCategory, Role, ChannelPermissionOverride, MemberWithRoles,
  MessageEdit, LinkPreview, StageInstance, StageSpeaker, StageInfo,
  SoundboardSound, BotUser, Webhook,
  ServerInvite, PublicServer, ServerFolder,
  DMMessageEdit, ScheduledMessage, ServerBan, ServerTimeout, AuditLogEntry,
  Thread, ThreadMessage, ThreadSubscription, PollWithOptions,
  ForumTag, ForumPost, ForumPostMessage,
  WelcomeConfig, OnboardingPrompt,
  ChannelFollow, AutoModRule
} from '@/types/models'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'

// Resolve attachment URLs — backend returns paths like /api/attachments/...
// In prod these resolve relative to the same origin; in dev we need the API host.
const API_ORIGIN = API_BASE.replace(/\/api$/, '')
export function resolveAttachmentUrl(url: string): string {
  if (url.startsWith('http')) return url
  return API_ORIGIN + url
}

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
    throw new ApiError(error.error || 'Unknown error', response.status, error.retry_after, error)
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
  retryAfter?: number
  automod?: boolean
  ruleName?: string
  action?: string
  constructor(message: string, status: number, retryAfter?: number, extra?: { automod?: boolean; rule_name?: string; action?: string }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfter = retryAfter
    if (extra) {
      this.automod = extra.automod
      this.ruleName = extra.rule_name
      this.action = extra.action
    }
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
    throw new ApiError(error.error || 'Unknown error', response.status, error.retry_after, error)
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
  members: (id: string) => request<ServerMember[]>(`/servers/${id}/members`),
  update: (id: string, data: { name?: string; icon_url?: string; is_public?: boolean; description?: string; gifs_enabled?: boolean; default_message_retention_days?: number | null }) =>
    request<Server>(`/servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  setNickname: (serverId: string, nickname: string | null) =>
    request<{ message: string }>(`/servers/${serverId}/members/me/nickname`, {
      method: 'PATCH',
      body: JSON.stringify({ nickname })
    })
}

// Channels
export const channels = {
  list: (serverId: string) => request<Channel[]>(`/servers/${serverId}/channels`),
  create: (serverId: string, data: CreateChannelRequest) =>
    request<Channel>(`/servers/${serverId}/channels`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (serverId: string, channelId: string, data: { name?: string; topic?: string; category_id?: string; slow_mode_interval?: number }) =>
    request<Channel>(`/servers/${serverId}/channels/${channelId}`, {
      method: 'PATCH',
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
  send: (channelId: string, content: string, files?: File[], msgType?: string, replyToId?: string) => {
    if (files && files.length > 0) {
      const fd = new FormData()
      fd.append('content', content)
      if (msgType) fd.append('type', msgType)
      if (replyToId) fd.append('reply_to_id', replyToId)
      files.forEach((f) => fd.append('files[]', f))
      return requestMultipart<Message>(`/channels/${channelId}/messages`, fd)
    }
    return request<Message>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, type: msgType, reply_to_id: replyToId })
    })
  },
  update: (id: string, content: string) =>
    request<Message>(`/messages/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/messages/${id}`, { method: 'DELETE' }),
  edits: (id: string) =>
    request<MessageEdit[]>(`/messages/${id}/edits`),
  around: (channelId: string, timestamp: string, limit?: number) => {
    const params = new URLSearchParams({ timestamp })
    if (limit) params.set('limit', String(limit))
    return request<Message[]>(`/channels/${channelId}/messages/around?${params}`)
  }
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

// Pins
export const pins = {
  list: (channelId: string) => request<Message[]>(`/channels/${channelId}/pins`),
  pin: (channelId: string, messageId: string) =>
    request<{ message: string }>(`/channels/${channelId}/pins/${messageId}`, { method: 'PUT' }),
  unpin: (channelId: string, messageId: string) =>
    request<{ message: string }>(`/channels/${channelId}/pins/${messageId}`, { method: 'DELETE' })
}

// Reactions
export const reactions = {
  add: (messageId: string, emoji: string) =>
    request<{ message: string }>(`/messages/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`, { method: 'PUT' }),
  remove: (messageId: string, emoji: string) =>
    request<{ message: string }>(`/messages/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`, { method: 'DELETE' })
}

// Categories
export const categories = {
  list: (serverId: string) => request<ChannelCategory[]>(`/servers/${serverId}/categories`),
  create: (serverId: string, name: string, position: number) =>
    request<ChannelCategory>(`/servers/${serverId}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name, position })
    }),
  update: (serverId: string, categoryId: string, data: { name?: string; position?: number }) =>
    request<ChannelCategory>(`/servers/${serverId}/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  delete: (serverId: string, categoryId: string) =>
    request<{ message: string }>(`/servers/${serverId}/categories/${categoryId}`, { method: 'DELETE' })
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
      files.forEach((f) => fd.append('files[]', f))
      return requestMultipart<DMMessage>(`/dm/conversations/${conversationId}/messages`, fd)
    }
    return request<DMMessage>(`/dm/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, type: msgType })
    })
  },
  getMessagesAround: (conversationId: string, timestamp: string, limit?: number) => {
    const params = new URLSearchParams({ timestamp })
    if (limit) params.set('limit', String(limit))
    return request<DMMessage[]>(`/dm/conversations/${conversationId}/messages/around?${params}`)
  },
  acceptRequest: (conversationId: string) =>
    request<{ message: string }>(`/dm/conversations/${conversationId}/accept`, { method: 'POST' }),
  declineRequest: (conversationId: string) =>
    request<{ message: string }>(`/dm/conversations/${conversationId}/decline`, { method: 'POST' }),
  getVoiceToken: (conversationId: string) =>
    request<{ token: string; room: string }>(
      `/dm/conversations/${conversationId}/voice-token`,
      { method: 'POST' }
    ),
  createGroup: (participantIds: string[]) =>
    request<DMConversationWithParticipants>('/dm/conversations/group', {
      method: 'POST',
      body: JSON.stringify({ participant_ids: participantIds })
    }),
  addParticipant: (conversationId: string, userId: string) =>
    request<{ message: string }>(`/dm/conversations/${conversationId}/participants`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    }),
  removeParticipant: (conversationId: string, userId: string) =>
    request<{ message: string }>(`/dm/conversations/${conversationId}/participants/${userId}`, {
      method: 'DELETE'
    }),
  renameConversation: (conversationId: string, name: string) =>
    request<{ message: string }>(`/dm/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name })
    }),
  editMessage: (id: string, content: string) =>
    request<DMMessage>(`/dm/messages/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    }),
  deleteMessage: (id: string) =>
    request<{ message: string }>(`/dm/messages/${id}`, { method: 'DELETE' }),
  addReaction: (id: string, emoji: string) =>
    request<{ message: string }>(`/dm/messages/${id}/reactions?emoji=${encodeURIComponent(emoji)}`, { method: 'PUT' }),
  removeReaction: (id: string, emoji: string) =>
    request<{ message: string }>(`/dm/messages/${id}/reactions?emoji=${encodeURIComponent(emoji)}`, { method: 'DELETE' }),
  getEdits: (id: string) =>
    request<DMMessageEdit[]>(`/dm/messages/${id}/edits`),
  pinMessage: (conversationId: string, messageId: string) =>
    request<{ message: string }>(`/dm/conversations/${conversationId}/pins/${messageId}`, { method: 'PUT' }),
  unpinMessage: (conversationId: string, messageId: string) =>
    request<{ message: string }>(`/dm/conversations/${conversationId}/pins/${messageId}`, { method: 'DELETE' }),
  getPinnedMessages: (conversationId: string) =>
    request<DMMessage[]>(`/dm/conversations/${conversationId}/pins`)
}

// E2EE Identity Keys
export interface IdentityKeyResponse {
  id: string
  user_id: string
  device_id: string
  public_key_jwk: JsonWebKey
  created_at: string
}

export interface KeyEnvelopeResponse {
  user_id: string
  envelope: number[] // byte array from server JSON
  updated_at: string
}

export const keys = {
  registerIdentityKey: (deviceId: string, publicKeyJWK: JsonWebKey) =>
    request<IdentityKeyResponse>('/keys/identity', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, public_key_jwk: publicKeyJWK })
    }),
  getMyKeys: () =>
    request<IdentityKeyResponse[]>('/keys/identity'),
  getUserKeys: (userId: string) =>
    request<IdentityKeyResponse[]>(`/keys/identity/${userId}`),
  removeDeviceKey: (deviceId: string) =>
    request<{ message: string }>(`/keys/identity/devices/${deviceId}`, { method: 'DELETE' }),
  storeEnvelope: (envelope: number[]) =>
    request<{ message: string }>('/keys/envelope', {
      method: 'PUT',
      body: JSON.stringify({ envelope })
    }),
  getEnvelope: () =>
    request<KeyEnvelopeResponse>('/keys/envelope'),
  deleteEnvelope: () =>
    request<{ message: string }>('/keys/envelope', { method: 'DELETE' }),
  storeGroupKey: (conversationId: string, epoch: number, userId: string, encryptedKey: number[]) =>
    request<{ message: string }>(`/keys/group/${conversationId}`, {
      method: 'POST',
      body: JSON.stringify({ epoch, user_id: userId, encrypted_key: encryptedKey })
    }),
  getGroupKeys: (conversationId: string) =>
    request<Array<{ conversation_id: string; epoch: number; user_id: string; encrypted_key: number[]; created_at: string }>>(`/keys/group/${conversationId}`),
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
    request<{ message: string }>(`/friends/${id}`, { method: 'DELETE' }),
  blocked: () => request<string[]>('/users/blocked'),
  block: (userId: string) =>
    request<{ message: string }>(`/users/${userId}/block`, { method: 'POST' }),
  unblock: (userId: string) =>
    request<{ message: string }>(`/users/${userId}/block`, { method: 'DELETE' })
}

// Roles
export const roles = {
  list: (serverId: string) =>
    request<Role[]>(`/servers/${serverId}/roles`),
  create: (serverId: string, data: { name: string; color?: string; permissions: string; hoist: boolean }) =>
    request<Role>(`/servers/${serverId}/roles`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (serverId: string, roleId: string, data: { name?: string; color?: string; permissions?: string; hoist?: boolean }) =>
    request<Role>(`/servers/${serverId}/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  delete: (serverId: string, roleId: string) =>
    request<{ message: string }>(`/servers/${serverId}/roles/${roleId}`, { method: 'DELETE' }),
  reorder: (serverId: string, positions: { role_id: string; position: number }[]) =>
    request<{ message: string }>(`/servers/${serverId}/roles/reorder`, {
      method: 'PUT',
      body: JSON.stringify(positions)
    }),
  assign: (serverId: string, userId: string, roleId: string) =>
    request<{ message: string }>(`/servers/${serverId}/members/${userId}/roles/${roleId}`, { method: 'PUT' }),
  remove: (serverId: string, userId: string, roleId: string) =>
    request<{ message: string }>(`/servers/${serverId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' }),
  membersWithRoles: (serverId: string) =>
    request<MemberWithRoles[]>(`/servers/${serverId}/members-with-roles`),
  channelOverrides: (serverId: string, channelId: string) =>
    request<ChannelPermissionOverride[]>(`/servers/${serverId}/channels/${channelId}/permissions`),
  setChannelOverride: (serverId: string, channelId: string, roleId: string, allow: string, deny: string) =>
    request<ChannelPermissionOverride>(`/servers/${serverId}/channels/${channelId}/permissions/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify({ allow, deny })
    }),
  deleteChannelOverride: (serverId: string, channelId: string, roleId: string) =>
    request<{ message: string }>(`/servers/${serverId}/channels/${channelId}/permissions/${roleId}`, { method: 'DELETE' })
}

// Read state / unread
export const readState = {
  ackChannel: (channelId: string) =>
    request<{ message: string }>(`/channels/${channelId}/ack`, { method: 'POST' }),
  ackDM: (conversationId: string) =>
    request<{ message: string }>(`/dm/conversations/${conversationId}/ack`, { method: 'POST' }),
  getUnread: () =>
    request<{
      channels: { channel_id: string; unread_count: number; mention_count: number }[]
      dms: { conversation_id: string; unread_count: number }[]
    }>('/me/unread')
}

// Search
export const search = {
  messages: (query: string, channelId?: string, serverId?: string, before?: string, limit?: number, filters?: { author_id?: string; has_attachment?: boolean; has_link?: boolean; date_from?: string; date_to?: string }) => {
    const params = new URLSearchParams({ q: query })
    if (channelId) params.set('channel_id', channelId)
    if (serverId) params.set('server_id', serverId)
    if (before) params.set('before', before)
    if (limit) params.set('limit', String(limit))
    if (filters?.author_id) params.set('author_id', filters.author_id)
    if (filters?.has_attachment) params.set('has_attachment', 'true')
    if (filters?.has_link) params.set('has_link', 'true')
    if (filters?.date_from) params.set('date_from', filters.date_from)
    if (filters?.date_to) params.set('date_to', filters.date_to)
    return request<Message[]>(`/search/messages?${params}`)
  },
  dm: (query: string, conversationId?: string, before?: string, limit?: number) => {
    const params = new URLSearchParams({ q: query })
    if (conversationId) params.set('conversation_id', conversationId)
    if (before) params.set('before', before)
    if (limit) params.set('limit', String(limit))
    return request<DMMessage[]>(`/search/dm?${params}`)
  }
}

// Notification preferences
export const notificationPrefs = {
  get: () =>
    request<{ user_id: string; scope_type: string; scope_id: string; setting: string }[]>('/me/notification-prefs'),
  set: (scopeType: string, scopeId: string, setting: string) =>
    request<{ message: string }>(`/me/notification-prefs/${scopeType}/${scopeId}`, {
      method: 'PUT',
      body: JSON.stringify({ setting })
    })
}

// Link previews
export const linkPreviews = {
  get: (url: string) =>
    request<LinkPreview>(`/link-preview?url=${encodeURIComponent(url)}`)
}

// Server invite preview (public)
export const invites = {
  preview: (code: string) =>
    request<ServerPreview>(`/servers/invite/${code}/preview`)
}

// Server invites (management)
export const serverInvites = {
  list: (serverId: string) =>
    request<ServerInvite[]>(`/servers/${serverId}/invites`),
  create: (serverId: string, maxUses?: number, expiresAt?: string) =>
    request<ServerInvite>(`/servers/${serverId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ max_uses: maxUses, expires_at: expiresAt })
    }),
  delete: (serverId: string, inviteId: string) =>
    request<{ message: string }>(`/servers/${serverId}/invites/${inviteId}`, { method: 'DELETE' }),
  use: (code: string) =>
    request<Server>('/servers/join/invite', {
      method: 'POST',
      body: JSON.stringify({ code })
    })
}

// User preferences (theme, compact mode)
export const userPreferences = {
  get: () =>
    request<{ theme: string; compact_mode: boolean }>('/me/preferences'),
  update: (data: { theme?: string; compact_mode?: boolean }) =>
    request<{ theme: string; compact_mode: boolean }>('/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data)
    })
}

// Server folders
export const serverFolders = {
  list: () => request<ServerFolder[]>('/me/server-folders'),
  create: (name: string, color: string) =>
    request<ServerFolder>('/me/server-folders', {
      method: 'POST',
      body: JSON.stringify({ name, color })
    }),
  update: (id: string, data: { name?: string; color?: string; position?: number }) =>
    request<ServerFolder>(`/me/server-folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/me/server-folders/${id}`, { method: 'DELETE' }),
  addServer: (folderId: string, serverId: string) =>
    request<{ message: string }>(`/me/server-folders/${folderId}/servers/${serverId}`, { method: 'PUT' }),
  removeServer: (folderId: string, serverId: string) =>
    request<{ message: string }>(`/me/server-folders/${folderId}/servers/${serverId}`, { method: 'DELETE' }),
}

// Scheduled Messages
export const scheduledMessages = {
  list: () =>
    request<ScheduledMessage[]>('/me/scheduled-messages'),
  create: (data: { channel_id?: string; dm_conversation_id?: string; content: string; type?: string; scheduled_at: string }) =>
    request<ScheduledMessage>('/me/scheduled-messages', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (id: string, data: { content: string; scheduled_at: string }) =>
    request<ScheduledMessage>(`/me/scheduled-messages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/me/scheduled-messages/${id}`, { method: 'DELETE' })
}

// Server discovery
export const discover = {
  search: (query: string, limit?: number, offset?: number) => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (limit) params.set('limit', String(limit))
    if (offset) params.set('offset', String(offset))
    return request<PublicServer[]>(`/servers/discover?${params}`)
  }
}

// Moderation
export const moderation = {
  ban: (serverId: string, userId: string, reason = '') =>
    request<ServerBan>(`/servers/${serverId}/bans`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, reason })
    }),
  unban: (serverId: string, userId: string) =>
    request<{ message: string }>(`/servers/${serverId}/bans/${userId}`, { method: 'DELETE' }),
  getBans: (serverId: string) =>
    request<ServerBan[]>(`/servers/${serverId}/bans`),
  kick: (serverId: string, userId: string, reason = '') =>
    request<{ message: string }>(`/servers/${serverId}/kick/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),
  timeout: (serverId: string, userId: string, duration: number, reason = '') =>
    request<ServerTimeout>(`/servers/${serverId}/timeout/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ duration, reason })
    }),
  removeTimeout: (serverId: string, userId: string) =>
    request<{ message: string }>(`/servers/${serverId}/timeout/${userId}`, { method: 'DELETE' }),
  getTimeouts: (serverId: string) =>
    request<ServerTimeout[]>(`/servers/${serverId}/timeouts`),
  getAuditLog: (serverId: string, limit?: number, before?: string) => {
    const params = new URLSearchParams()
    if (limit) params.set('limit', String(limit))
    if (before) params.set('before', before)
    const query = params.toString()
    return request<AuditLogEntry[]>(`/servers/${serverId}/audit-log${query ? `?${query}` : ''}`)
  }
}

// Threads
export const threads = {
  create: (channelId: string, parentMessageId: string, name?: string) =>
    request<Thread>(`/channels/${channelId}/threads`, {
      method: 'POST',
      body: JSON.stringify({ parent_message_id: parentMessageId, name: name || '' })
    }),
  list: (channelId: string) =>
    request<Thread[]>(`/channels/${channelId}/threads`),
  get: (threadId: string) =>
    request<Thread>(`/threads/${threadId}`),
  update: (threadId: string, data: { name?: string; archived?: boolean; locked?: boolean }) =>
    request<Thread>(`/threads/${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  sendMessage: (threadId: string, content: string, replyToId?: string) =>
    request<ThreadMessage>(`/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, reply_to_id: replyToId })
    }),
  getMessages: (threadId: string, before?: string, limit?: number) => {
    const params = new URLSearchParams()
    if (before) params.set('before', before)
    if (limit) params.set('limit', String(limit))
    const query = params.toString()
    return request<ThreadMessage[]>(`/threads/${threadId}/messages${query ? `?${query}` : ''}`)
  },
  deleteMessage: (threadId: string, messageId: string) =>
    request<void>(`/threads/${threadId}/messages/${messageId}`, { method: 'DELETE' }),
  updateSubscription: (threadId: string, notificationLevel: string) =>
    request<ThreadSubscription>(`/threads/${threadId}/subscription`, {
      method: 'PUT',
      body: JSON.stringify({ notification_level: notificationLevel })
    })
}

// Polls
export const polls = {
  create: (channelId: string, data: {
    question: string
    options: { text: string; emoji?: string }[]
    multi_select?: boolean
    anonymous?: boolean
    expires_at?: string
  }) =>
    request<PollWithOptions>(`/channels/${channelId}/polls`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  get: (pollId: string) =>
    request<PollWithOptions>(`/polls/${pollId}`),
  vote: (pollId: string, optionId: string) =>
    request<{ message: string }>(`/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ option_id: optionId })
    }),
  removeVote: (pollId: string, optionId: string) =>
    request<{ message: string }>(`/polls/${pollId}/vote/${optionId}`, { method: 'DELETE' })
}

// Forum channels (WP16)
export const forum = {
  // Tags
  getTags: (channelId: string) =>
    request<ForumTag[]>(`/channels/${channelId}/forum/tags`),
  createTag: (channelId: string, data: { name: string; color?: string; emoji?: string; position?: number; moderated?: boolean }) =>
    request<ForumTag>(`/channels/${channelId}/forum/tags`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateTag: (channelId: string, tagId: string, data: { name?: string; color?: string; emoji?: string; position?: number; moderated?: boolean }) =>
    request<ForumTag>(`/channels/${channelId}/forum/tags/${tagId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  deleteTag: (channelId: string, tagId: string) =>
    request<{ message: string }>(`/channels/${channelId}/forum/tags/${tagId}`, { method: 'DELETE' }),

  // Posts
  getPosts: (channelId: string, sort?: string, tags?: string[], limit?: number, offset?: number) => {
    const params = new URLSearchParams()
    if (sort) params.set('sort', sort)
    if (tags && tags.length > 0) params.set('tags', tags.join(','))
    if (limit) params.set('limit', String(limit))
    if (offset) params.set('offset', String(offset))
    const query = params.toString()
    return request<ForumPost[]>(`/channels/${channelId}/forum/posts${query ? `?${query}` : ''}`)
  },
  createPost: (channelId: string, data: { title: string; content: string; tag_ids?: string[] }) =>
    request<ForumPost>(`/channels/${channelId}/forum/posts`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getPost: (postId: string) =>
    request<ForumPost>(`/forum/posts/${postId}`),
  deletePost: (postId: string) =>
    request<{ message: string }>(`/forum/posts/${postId}`, { method: 'DELETE' }),
  updatePostTags: (postId: string, tagIds: string[]) =>
    request<{ message: string }>(`/forum/posts/${postId}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tag_ids: tagIds })
    }),
  pinPost: (postId: string) =>
    request<{ message: string }>(`/forum/posts/${postId}/pin`, { method: 'PUT' }),
  unpinPost: (postId: string) =>
    request<{ message: string }>(`/forum/posts/${postId}/pin`, { method: 'DELETE' }),

  // Post messages
  getPostMessages: (postId: string, limit?: number, offset?: number) => {
    const params = new URLSearchParams()
    if (limit) params.set('limit', String(limit))
    if (offset) params.set('offset', String(offset))
    const query = params.toString()
    return request<ForumPostMessage[]>(`/forum/posts/${postId}/messages${query ? `?${query}` : ''}`)
  },
  deletePostMessage: (postId: string, messageId: string) =>
    request<void>(`/forum/posts/${postId}/messages/${messageId}`, { method: 'DELETE' }),
  createPostMessage: (postId: string, content: string) =>
    request<ForumPostMessage>(`/forum/posts/${postId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content })
    })
}

// Onboarding (WP20)
export const onboarding = {
  getWelcome: (serverId: string) =>
    request<WelcomeConfig>(`/servers/${serverId}/welcome`),
  updateWelcome: (serverId: string, data: { welcome_message: string; welcome_channels: string[] }) =>
    request<WelcomeConfig>(`/servers/${serverId}/welcome`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  getPrompts: (serverId: string) =>
    request<OnboardingPrompt[]>(`/servers/${serverId}/onboarding`),
  updatePrompts: (serverId: string, prompts: OnboardingPrompt[]) =>
    request<OnboardingPrompt[]>(`/servers/${serverId}/onboarding`, {
      method: 'PUT',
      body: JSON.stringify({ prompts })
    }),
  complete: (serverId: string, selectedOptionIds: string[]) =>
    request<{ message: string }>(`/servers/${serverId}/onboarding/complete`, {
      method: 'POST',
      body: JSON.stringify({ selected_option_ids: selectedOptionIds })
    }),
  getStatus: (serverId: string) =>
    request<{ completed: boolean }>(`/servers/${serverId}/onboarding/status`)
}

// Channel follows - announcement channels (WP21)
export const channelFollows = {
  follow: (channelId: string, targetChannelId: string) =>
    request<ChannelFollow>(`/channels/${channelId}/followers`, {
      method: 'POST',
      body: JSON.stringify({ target_channel_id: targetChannelId })
    }),
  unfollow: (channelId: string, followId: string) =>
    request<{ message: string }>(`/channels/${channelId}/followers/${followId}`, {
      method: 'DELETE'
    }),
  list: (channelId: string) =>
    request<ChannelFollow[]>(`/channels/${channelId}/followers`)
}

// AutoMod (WP31)
export const automod = {
  list: (serverId: string) =>
    request<AutoModRule[]>(`/servers/${serverId}/automod/rules`),
  create: (serverId: string, data: {
    name: string
    type: string
    trigger_data: Record<string, unknown>
    action: string
    action_metadata: Record<string, unknown>
    enabled: boolean
    exempt_roles: string[]
    exempt_channels: string[]
  }) =>
    request<AutoModRule>(`/servers/${serverId}/automod/rules`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  update: (serverId: string, ruleId: string, data: Partial<{
    name: string
    trigger_data: Record<string, unknown>
    action: string
    action_metadata: Record<string, unknown>
    enabled: boolean
    exempt_roles: string[]
    exempt_channels: string[]
  }>) =>
    request<AutoModRule>(`/servers/${serverId}/automod/rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  delete: (serverId: string, ruleId: string) =>
    request<{ message: string }>(`/servers/${serverId}/automod/rules/${ruleId}`, { method: 'DELETE' })
}

// Stage channels
export const stage = {
  getInfo: (channelId: string) =>
    request<StageInfo>(`/channels/${channelId}/stage`),
  start: (channelId: string, topic: string) =>
    request<StageInstance>(`/channels/${channelId}/stage`, {
      method: 'POST',
      body: JSON.stringify({ topic })
    }),
  end: (channelId: string) =>
    request<{ message: string }>(`/channels/${channelId}/stage`, { method: 'DELETE' }),
  addSpeaker: (channelId: string) =>
    request<StageSpeaker>(`/channels/${channelId}/stage/speakers`, { method: 'POST' }),
  removeSpeaker: (channelId: string, userId: string) =>
    request<{ message: string }>(`/channels/${channelId}/stage/speakers/${userId}`, { method: 'DELETE' }),
  raiseHand: (channelId: string) =>
    request<{ message: string }>(`/channels/${channelId}/stage/hand-raise`, { method: 'POST' }),
  lowerHand: (channelId: string) =>
    request<{ message: string }>(`/channels/${channelId}/stage/hand-raise`, { method: 'DELETE' }),
  inviteToSpeak: (channelId: string, userId: string) =>
    request<{ message: string }>(`/channels/${channelId}/stage/invite/${userId}`, { method: 'POST' })
}

// Soundboard
export const soundboard = {
  list: (serverId: string) =>
    request<SoundboardSound[]>(`/servers/${serverId}/soundboard`),
  upload: (serverId: string, name: string, file: File, durationMs: number) => {
    const fd = new FormData()
    fd.append('name', name)
    fd.append('sound', file)
    fd.append('duration_ms', String(durationMs))
    return requestMultipart<SoundboardSound>(`/servers/${serverId}/soundboard`, fd)
  },
  delete: (serverId: string, soundId: string) =>
    request<{ message: string }>(`/servers/${serverId}/soundboard/${soundId}`, { method: 'DELETE' })
}

// Bots
export const bots = {
  list: () => request<BotUser[]>('/bots'),
  create: (username: string) =>
    request<{ bot: BotUser; token: string }>('/bots', {
      method: 'POST',
      body: JSON.stringify({ username })
    }),
  delete: (botId: string) =>
    request<{ message: string }>(`/bots/${botId}`, { method: 'DELETE' }),
  regenerateToken: (botId: string) =>
    request<{ token: string }>(`/bots/${botId}/regenerate-token`, { method: 'POST' })
}

// Webhooks
export const webhooks = {
  list: (channelId: string) =>
    request<Webhook[]>(`/channels/${channelId}/webhooks`),
  create: (channelId: string, name: string) =>
    request<Webhook>(`/channels/${channelId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify({ name })
    }),
  delete: (webhookId: string) =>
    request<{ message: string }>(`/webhooks/${webhookId}`, { method: 'DELETE' })
}

// Large file uploads
export const uploads = {
  initiate: (filename: string, contentType: string, fileSize: number) =>
    request<{ pending_upload_id: string; part_urls: string[]; part_size: number }>('/uploads/initiate', {
      method: 'POST',
      body: JSON.stringify({ filename, content_type: contentType, file_size: fileSize })
    }),
  reportPart: (pendingUploadId: string, partNumber: number, etag: string) =>
    request<void>(`/uploads/${pendingUploadId}/part-complete`, {
      method: 'POST',
      body: JSON.stringify({ part_number: partNumber, etag })
    }),
  complete: (pendingUploadId: string, messageId?: string, dmMessageId?: string) =>
    request<{ id: string; url: string; filename: string; original_filename: string; content_type: string; size: number }>(`/uploads/${pendingUploadId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ message_id: messageId, dm_message_id: dmMessageId })
    }),
  abort: (pendingUploadId: string) =>
    request<void>(`/uploads/${pendingUploadId}`, { method: 'DELETE' })
}

// Exports
export const exports = {
  channelMessages: async (channelId: string, format: 'json' | 'html'): Promise<Blob> => {
    const headers: Record<string, string> = {}
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }
    const response = await fetch(
      `${API_BASE}/channels/${channelId}/export?format=${format}`,
      { method: 'POST', headers }
    )
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Export failed' }))
      throw new ApiError(error.error || 'Export failed', response.status)
    }
    return response.blob()
  },
  accountData: async (): Promise<Blob> => {
    const headers: Record<string, string> = {}
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }
    const response = await fetch(`${API_BASE}/me/data-export`, {
      method: 'POST',
      headers
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Export failed' }))
      throw new ApiError(error.error || 'Export failed', response.status)
    }
    return response.blob()
  }
}
