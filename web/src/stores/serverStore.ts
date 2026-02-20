import { create } from 'zustand'
import type { Server, Channel, ServerMember } from '@/types/models'
import { servers as serversApi, channels as channelsApi } from '@/services/api'

interface ServerState {
  servers: Server[]
  activeServerId: string | null
  channels: Channel[]
  activeChannelId: string | null
  members: ServerMember[]
  isLoading: boolean
  error: string | null

  fetchServers: () => Promise<void>
  setActiveServer: (serverId: string) => Promise<void>
  setActiveChannel: (channelId: string) => void
  createServer: (name: string) => Promise<Server>
  joinServer: (inviteCode: string) => Promise<void>
  leaveServer: (serverId: string) => Promise<void>
  deleteServer: (serverId: string) => Promise<void>
  createChannel: (name: string, type: 'text' | 'voice') => Promise<void>
  addChannel: (channel: Channel) => void
  removeChannel: (channelId: string) => void
  addMember: (member: ServerMember) => void
  removeMember: (userId: string) => void
  updateMemberStatus: (userId: string, status: string) => void
  updateMemberProfile: (userId: string, updates: Partial<ServerMember>) => void
  clearError: () => void
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  activeServerId: null,
  channels: [],
  activeChannelId: null,
  members: [],
  isLoading: false,
  error: null,

  fetchServers: async () => {
    set({ isLoading: true })
    try {
      const servers = await serversApi.list()
      set({ servers, isLoading: false })
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to fetch servers' })
    }
  },

  setActiveServer: async (serverId) => {
    set({ activeServerId: serverId, isLoading: true })
    try {
      const [channels, members] = await Promise.all([
        channelsApi.list(serverId),
        serversApi.members(serverId)
      ])
      const textChannels = channels.filter((c) => c.type === 'text')
      set({
        channels,
        members,
        activeChannelId: textChannels[0]?.id ?? null,
        isLoading: false
      })
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to load server' })
    }
  },

  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),

  createServer: async (name) => {
    const result = await serversApi.create({ name })
    set((state) => ({ servers: [...state.servers, result.server] }))
    return result.server
  },

  joinServer: async (inviteCode) => {
    const server = await serversApi.join({ invite_code: inviteCode })
    set((state) => ({ servers: [...state.servers, server] }))
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

  createChannel: async (name, type) => {
    const { activeServerId } = get()
    if (!activeServerId) return
    const channel = await channelsApi.create(activeServerId, { name, type })
    set((state) => ({ channels: [...state.channels, channel] }))
  },

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

  addMember: (member) =>
    set((state) => ({ members: [...state.members, member] })),

  removeMember: (userId) =>
    set((state) => ({ members: state.members.filter((m) => m.id !== userId) })),

  updateMemberStatus: (userId, status) =>
    set((state) => ({
      members: state.members.map((m) =>
        m.id === userId ? { ...m, status } : m
      )
    })),

  updateMemberProfile: (userId, updates) =>
    set((state) => ({
      members: state.members.map((m) =>
        m.id === userId ? { ...m, ...updates } : m
      )
    })),

  clearError: () => set({ error: null })
}))
