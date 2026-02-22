import { create } from 'zustand'
import type { Server, Channel, ServerMember, ChannelCategory } from '@renderer/types/models'
import { servers as serversApi, channels as channelsApi, categories as categoriesApi, roles as rolesApi } from '@renderer/services/api'
import { usePermissionStore } from './permissionStore'

interface ServerState {
  servers: Server[]
  activeServerId: string | null
  channels: Channel[]
  categories: ChannelCategory[]
  activeChannelId: string | null
  members: ServerMember[]
  onlineUserIds: Set<string>
  isDiscoverOpen: boolean
  isLoading: boolean
  error: string | null

  setDiscoverOpen: (open: boolean) => void
  fetchServers: () => Promise<void>
  setActiveServer: (serverId: string) => Promise<void>
  setActiveChannel: (channelId: string) => void
  createServer: (name: string) => Promise<Server>
  joinServer: (inviteCode: string) => Promise<Server>
  leaveServer: (serverId: string) => Promise<void>
  deleteServer: (serverId: string) => Promise<void>
  createChannel: (name: string, type: 'text' | 'voice' | 'forum', isAnnouncement?: boolean) => Promise<void>
  updateServer: (server: Server) => void
  updateChannel: (channel: Channel) => void
  addChannel: (channel: Channel) => void
  removeChannel: (channelId: string) => void
  addCategory: (category: ChannelCategory) => void
  updateCategory: (category: ChannelCategory) => void
  removeCategory: (categoryId: string) => void
  updateMemberNickname: (userId: string, nickname: string | null) => void
  addMember: (member: ServerMember) => void
  removeMember: (userId: string) => void
  updateMemberStatus: (userId: string, status: string) => void
  setOnlineUserIds: (ids: string[]) => void
  updateMemberProfile: (userId: string, updates: Partial<ServerMember>) => void
  setActiveServerNull: () => void
  clearError: () => void
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  activeServerId: localStorage.getItem('app:activeServerId'),
  channels: [],
  categories: [],
  activeChannelId: null,
  members: [],
  onlineUserIds: new Set(),
  isDiscoverOpen: false,
  isLoading: false,
  error: null,

  setDiscoverOpen: (open) => set({ isDiscoverOpen: open }),

  fetchServers: async () => {
    set({ isLoading: true })
    try {
      const servers = await serversApi.list()
      set({ servers, isLoading: false })

      // Restore active server after fetching
      const savedServerId = get().activeServerId
      if (savedServerId && servers.some((s) => s.id === savedServerId)) {
        get().setActiveServer(savedServerId)
      } else {
        localStorage.removeItem('app:activeServerId')
        localStorage.removeItem('app:activeChannelId')
      }
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to fetch servers' })
    }
  },

  setActiveServer: async (serverId) => {
    localStorage.setItem('app:activeServerId', serverId)
    set({ activeServerId: serverId, isDiscoverOpen: false, isLoading: true })
    try {
      const [channels, members, cats, serverRoles] = await Promise.all([
        channelsApi.list(serverId),
        serversApi.members(serverId),
        categoriesApi.list(serverId).catch(() => [] as ChannelCategory[]),
        rolesApi.list(serverId).catch(() => [])
      ])
      // Update permission store with roles
      usePermissionStore.getState().setRoles(serverRoles)
      // Fetch members with roles to populate memberRoleIds
      rolesApi.membersWithRoles(serverId).then((membersWithRoles) => {
        const permStore = usePermissionStore.getState()
        for (const m of membersWithRoles) {
          if (m.roles && m.roles.length > 0) {
            permStore.setMemberRoles(m.id, m.roles.map((r) => r.id))
          }
        }
      }).catch(() => {})
      const savedChannelId = localStorage.getItem('app:activeChannelId')
      const restoredChannel = savedChannelId ? channels.find((c) => c.id === savedChannelId) : null
      const textChannels = channels.filter((c) => c.type === 'text')
      const activeChannelId = restoredChannel?.id ?? textChannels[0]?.id ?? null
      if (activeChannelId) localStorage.setItem('app:activeChannelId', activeChannelId)
      // Apply online statuses from READY data (may have arrived before members loaded)
      const { onlineUserIds } = get()
      const updatedMembers = onlineUserIds.size > 0
        ? members.map((m) => ({
            ...m,
            status: onlineUserIds.has(m.id)
              ? (m.status === 'offline' ? 'online' : m.status)
              : 'offline'
          }))
        : members
      set({
        channels,
        categories: cats,
        members: updatedMembers,
        activeChannelId,
        isLoading: false
      })
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load server' })
    }
  },

  setActiveChannel: (channelId) => {
    localStorage.setItem('app:activeChannelId', channelId)
    set({ activeChannelId: channelId })
  },

  createServer: async (name) => {
    const result = await serversApi.create({ name })
    set((state) => ({
      servers: state.servers.some((s) => s.id === result.server.id)
        ? state.servers
        : [...state.servers, result.server]
    }))
    return result.server
  },

  joinServer: async (inviteCode) => {
    const server = await serversApi.join({ invite_code: inviteCode })
    set((state) => ({
      servers: state.servers.some((s) => s.id === server.id)
        ? state.servers
        : [...state.servers, server]
    }))
    return server
  },

  leaveServer: async (serverId) => {
    await serversApi.leave(serverId)
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== serverId),
      activeServerId: state.activeServerId === serverId ? null : state.activeServerId
    }))
  },

  deleteServer: async (serverId) => {
    await serversApi.delete(serverId)
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== serverId),
      activeServerId: state.activeServerId === serverId ? null : state.activeServerId
    }))
  },

  createChannel: async (name, type, isAnnouncement) => {
    const { activeServerId } = get()
    if (!activeServerId) return
    const channel = await channelsApi.create(activeServerId, { name, type, is_announcement: isAnnouncement })
    get().addChannel(channel)
  },

  updateServer: (server) =>
    set((state) => ({
      servers: state.servers.map((s) => (s.id === server.id ? server : s))
    })),

  updateChannel: (channel) =>
    set((state) => ({
      channels: state.channels.map((c) => (c.id === channel.id ? channel : c))
    })),

  addChannel: (channel) =>
    set((state) => ({
      channels: state.channels.some((c) => c.id === channel.id)
        ? state.channels
        : [...state.channels, channel]
    })),

  removeChannel: (channelId) =>
    set((state) => ({
      channels: state.channels.filter((c) => c.id !== channelId),
      activeChannelId: state.activeChannelId === channelId ? null : state.activeChannelId
    })),

  addCategory: (category) =>
    set((state) => ({
      categories: state.categories.some((c) => c.id === category.id)
        ? state.categories
        : [...state.categories, category]
    })),

  updateCategory: (category) =>
    set((state) => ({
      categories: state.categories.map((c) => (c.id === category.id ? category : c))
    })),

  removeCategory: (categoryId) =>
    set((state) => ({
      categories: state.categories.filter((c) => c.id !== categoryId)
    })),

  updateMemberNickname: (userId, nickname) =>
    set((state) => ({
      members: state.members.map((m) =>
        m.id === userId ? { ...m, nickname } : m
      )
    })),

  addMember: (member) =>
    set((state) => ({
      members: state.members.some((m) => m.id === member.id)
        ? state.members
        : [...state.members, member]
    })),

  removeMember: (userId) =>
    set((state) => ({ members: state.members.filter((m) => m.id !== userId) })),

  updateMemberStatus: (userId, status) =>
    set((state) => ({
      // onlineUserIds tracks connected users — any status other than 'offline' means connected
      onlineUserIds: status !== 'offline'
        ? new Set([...state.onlineUserIds, userId])
        : new Set([...state.onlineUserIds].filter((id) => id !== userId)),
      members: state.members.map((m) =>
        m.id === userId ? { ...m, status } : m
      )
    })),

  setOnlineUserIds: (ids) => {
    const onlineSet = new Set(ids)
    set((state) => ({
      onlineUserIds: onlineSet,
      members: state.members.map((m) => ({
        ...m,
        // If user is connected, keep their existing status (dnd/idle/online)
        // but upgrade "offline" to "online". If not connected, mark offline.
        status: onlineSet.has(m.id)
          ? (m.status === 'offline' ? 'online' : m.status)
          : 'offline'
      }))
    }))
  },

  updateMemberProfile: (userId, updates) =>
    set((state) => ({
      members: state.members.map((m) =>
        m.id === userId ? { ...m, ...updates } : m
      )
    })),

  setActiveServerNull: () => {
    localStorage.removeItem('app:activeServerId')
    localStorage.removeItem('app:activeChannelId')
    set({ activeServerId: null, isDiscoverOpen: false, channels: [], categories: [], activeChannelId: null, members: [] })
  },

  clearError: () => set({ error: null })
}))
