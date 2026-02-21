import { create } from 'zustand'
import { readState, notificationPrefs } from '@/services/api'

interface UnreadInfo {
  count: number
  mentionCount: number
}

type NotifSetting = 'all' | 'mentions' | 'none'

interface NotifPref {
  scope_type: string
  scope_id: string
  setting: NotifSetting
}

interface NotificationState {
  channelUnread: Record<string, UnreadInfo>
  dmUnread: Record<string, number>
  prefs: NotifPref[]

  init: () => Promise<void>
  loadPrefs: () => Promise<void>
  setPref: (scopeType: string, scopeId: string, setting: NotifSetting) => Promise<void>
  getEffectiveSetting: (channelId: string, serverId: string | null) => NotifSetting
  incrementUnread: (channelId: string) => void
  incrementDMUnread: (conversationId: string) => void
  clearUnread: (channelId: string) => void
  clearDMUnread: (conversationId: string) => void
  incrementMention: (channelId: string) => void
  getChannelUnread: (channelId: string) => UnreadInfo
  getDMUnread: (conversationId: string) => number
}

const emptyUnread: UnreadInfo = { count: 0, mentionCount: 0 }

export const useNotificationStore = create<NotificationState>((set, get) => ({
  channelUnread: {},
  dmUnread: {},
  prefs: [],

  init: async () => {
    try {
      const data = await readState.getUnread()
      const channelUnread: Record<string, UnreadInfo> = {}
      for (const ch of data.channels) {
        channelUnread[ch.channel_id] = {
          count: ch.unread_count,
          mentionCount: ch.mention_count
        }
      }
      const dmUnread: Record<string, number> = {}
      for (const dm of data.dms) {
        dmUnread[dm.conversation_id] = dm.unread_count
      }
      set({ channelUnread, dmUnread })
    } catch {
      // ignore
    }
    // Also load prefs
    get().loadPrefs()
  },

  loadPrefs: async () => {
    try {
      const data = await notificationPrefs.get()
      set({ prefs: data.map((p) => ({ scope_type: p.scope_type, scope_id: p.scope_id, setting: p.setting as NotifSetting })) })
    } catch {
      // ignore
    }
  },

  setPref: async (scopeType, scopeId, setting) => {
    try {
      await notificationPrefs.set(scopeType, scopeId, setting)
      if (setting === 'all') {
        // Remove pref (default)
        set((state) => ({
          prefs: state.prefs.filter((p) => !(p.scope_type === scopeType && p.scope_id === scopeId))
        }))
      } else {
        set((state) => {
          const existing = state.prefs.findIndex((p) => p.scope_type === scopeType && p.scope_id === scopeId)
          if (existing >= 0) {
            const updated = [...state.prefs]
            updated[existing] = { scope_type: scopeType, scope_id: scopeId, setting }
            return { prefs: updated }
          }
          return { prefs: [...state.prefs, { scope_type: scopeType, scope_id: scopeId, setting }] }
        })
      }
    } catch {
      // ignore
    }
  },

  getEffectiveSetting: (channelId, serverId) => {
    const { prefs } = get()
    // Check channel-level first
    const channelPref = prefs.find((p) => p.scope_type === 'channel' && p.scope_id === channelId)
    if (channelPref) return channelPref.setting
    // Check server-level
    if (serverId) {
      const serverPref = prefs.find((p) => p.scope_type === 'server' && p.scope_id === serverId)
      if (serverPref) return serverPref.setting
    }
    return 'all'
  },

  incrementUnread: (channelId) =>
    set((state) => {
      const current = state.channelUnread[channelId] ?? emptyUnread
      return {
        channelUnread: {
          ...state.channelUnread,
          [channelId]: { ...current, count: current.count + 1 }
        }
      }
    }),

  incrementDMUnread: (conversationId) =>
    set((state) => ({
      dmUnread: {
        ...state.dmUnread,
        [conversationId]: (state.dmUnread[conversationId] ?? 0) + 1
      }
    })),

  clearUnread: (channelId) =>
    set((state) => {
      const { [channelId]: _, ...rest } = state.channelUnread
      return { channelUnread: rest }
    }),

  clearDMUnread: (conversationId) =>
    set((state) => {
      const { [conversationId]: _, ...rest } = state.dmUnread
      return { dmUnread: rest }
    }),

  incrementMention: (channelId) =>
    set((state) => {
      const current = state.channelUnread[channelId] ?? emptyUnread
      return {
        channelUnread: {
          ...state.channelUnread,
          [channelId]: {
            count: current.count,
            mentionCount: current.mentionCount + 1
          }
        }
      }
    }),

  getChannelUnread: (channelId) => {
    return get().channelUnread[channelId] ?? emptyUnread
  },

  getDMUnread: (conversationId) => {
    return get().dmUnread[conversationId] ?? 0
  }
}))
