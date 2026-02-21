import { create } from 'zustand'
import type { Message } from '@/types/models'
import { messages as messagesApi, pins as pinsApi, reactions as reactionsApi } from '@/services/api'

interface MessageState {
  messages: Message[]
  isLoading: boolean
  hasMore: boolean
  replyingTo: Message | null
  pinnedMessages: Message[]
  showPinnedPanel: boolean

  fetchMessages: (channelId: string, before?: string) => Promise<void>
  sendMessage: (channelId: string, content: string, files?: File[], msgType?: string) => Promise<void>
  addMessage: (message: Message) => void
  updateMessage: (message: Message) => void
  removeMessage: (messageId: string) => void
  clearMessages: () => void
  setReplyingTo: (message: Message | null) => void
  fetchPinnedMessages: (channelId: string) => Promise<void>
  setShowPinnedPanel: (show: boolean) => void
  addReaction: (messageId: string, emoji: string, isMe: boolean) => void
  removeReaction: (messageId: string, emoji: string, isMe: boolean) => void
  toggleReaction: (messageId: string, emoji: string) => Promise<void>
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  isLoading: false,
  hasMore: true,
  replyingTo: null,
  pinnedMessages: [],
  showPinnedPanel: false,

  fetchMessages: async (channelId, before) => {
    set({ isLoading: true })
    try {
      const newMessages = await messagesApi.list(channelId, before, 50)
      set((state) => ({
        messages: before ? [...state.messages, ...newMessages] : newMessages,
        hasMore: newMessages.length === 50,
        isLoading: false
      }))
    } catch {
      set({ isLoading: false })
    }
  },

  sendMessage: async (channelId, content, files, msgType) => {
    const { replyingTo } = get()
    await messagesApi.send(channelId, content, files, msgType, replyingTo?.id)
    set({ replyingTo: null })
  },

  addMessage: (message) =>
    set((state) => ({ messages: [message, ...state.messages] })),

  updateMessage: (message) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === message.id ? { ...m, ...message } : m))
    })),

  removeMessage: (messageId) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
      pinnedMessages: state.pinnedMessages.filter((m) => m.id !== messageId)
    })),

  clearMessages: () => set({ messages: [], hasMore: true, replyingTo: null, pinnedMessages: [], showPinnedPanel: false }),

  setReplyingTo: (message) => set({ replyingTo: message }),

  fetchPinnedMessages: async (channelId) => {
    try {
      const pinned = await pinsApi.list(channelId)
      set({ pinnedMessages: pinned })
    } catch {
      // ignore
    }
  },

  setShowPinnedPanel: (show) => set({ showPinnedPanel: show }),

  addReaction: (messageId, emoji, isMe) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m
        const reactions = [...(m.reactions || [])]
        const existing = reactions.find((r) => r.emoji === emoji)
        if (existing) {
          // Skip if this is our own reaction and we already marked it
          if (isMe && existing.me) return m
          return {
            ...m,
            reactions: reactions.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count + 1, me: r.me || isMe } : r
            )
          }
        }
        return {
          ...m,
          reactions: [...reactions, { emoji, count: 1, me: isMe }]
        }
      })
    })),

  removeReaction: (messageId, emoji, isMe) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m
        const existing = (m.reactions || []).find((r) => r.emoji === emoji)
        // Skip if this is our own removal and we already un-marked it
        if (isMe && existing && !existing.me) return m
        const reactions = (m.reactions || [])
          .map((r) =>
            r.emoji === emoji ? { ...r, count: r.count - 1, me: isMe ? false : r.me } : r
          )
          .filter((r) => r.count > 0)
        return { ...m, reactions }
      })
    })),

  toggleReaction: async (messageId, emoji) => {
    const msg = get().messages.find((m) => m.id === messageId)
    const existing = msg?.reactions?.find((r) => r.emoji === emoji)
    if (existing?.me) {
      // Optimistic remove
      get().removeReaction(messageId, emoji, true)
      try {
        await reactionsApi.remove(messageId, emoji)
      } catch {
        // Rollback on failure
        get().addReaction(messageId, emoji, true)
      }
    } else {
      // Optimistic add
      get().addReaction(messageId, emoji, true)
      try {
        await reactionsApi.add(messageId, emoji)
      } catch {
        // Rollback on failure
        get().removeReaction(messageId, emoji, true)
      }
    }
  }
}))
