import { create } from 'zustand'
import type { Message } from '@/types/models'
import { messages as messagesApi, pins as pinsApi, reactions as reactionsApi } from '@/services/api'

interface MessageState {
  messages: Message[]
  isLoading: boolean
  isFetchingMore: boolean
  hasMore: boolean
  replyingTo: Message | null
  pinnedMessages: Message[]
  showPinnedPanel: boolean
  highlightedMessageId: string | null
  isJumpedState: boolean
  editingMessageId: string | null

  fetchMessages: (channelId: string, before?: string) => Promise<void>
  fetchMoreMessages: (channelId: string) => Promise<void>
  jumpToDate: (channelId: string, date: Date) => Promise<void>
  jumpToPresent: (channelId: string) => Promise<void>
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
  setHighlightedMessageId: (id: string | null) => void
  setEditingMessageId: (id: string | null) => void
  editMessage: (messageId: string, content: string) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  updateMessagePoll: (messageId: string, poll: Message['poll']) => void
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  isLoading: false,
  isFetchingMore: false,
  hasMore: true,
  replyingTo: null,
  pinnedMessages: [],
  showPinnedPanel: false,
  highlightedMessageId: null,
  isJumpedState: false,
  editingMessageId: null,

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

  fetchMoreMessages: async (channelId) => {
    const { messages, isFetchingMore, hasMore } = get()
    if (isFetchingMore || !hasMore || messages.length === 0) return

    set({ isFetchingMore: true })
    try {
      // Messages are in DESC order, so last item is the oldest
      const oldest = messages[messages.length - 1]
      const olderMessages = await messagesApi.list(channelId, oldest.created_at, 50)
      set((state) => ({
        messages: [...state.messages, ...olderMessages],
        hasMore: olderMessages.length === 50,
        isFetchingMore: false
      }))
    } catch {
      set({ isFetchingMore: false })
    }
  },

  jumpToDate: async (channelId, date) => {
    set({ isLoading: true, isJumpedState: true })
    try {
      const timestamp = date.toISOString()
      const around = await messagesApi.around(channelId, timestamp, 25)
      set({
        messages: around,
        hasMore: true, // There could be older messages
        isLoading: false
      })
    } catch {
      set({ isLoading: false })
    }
  },

  jumpToPresent: async (channelId) => {
    set({ isLoading: true, isJumpedState: false })
    try {
      const newMessages = await messagesApi.list(channelId, undefined, 50)
      set({
        messages: newMessages,
        hasMore: newMessages.length === 50,
        isLoading: false
      })
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
    set((state) => {
      // Don't add new messages if we're in a jumped state (viewing historical messages)
      if (state.isJumpedState) return state
      if (state.messages.some((m) => m.id === message.id)) return state
      return { messages: [message, ...state.messages] }
    }),

  updateMessage: (message) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === message.id ? { ...m, ...message } : m))
    })),

  removeMessage: (messageId) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
      pinnedMessages: state.pinnedMessages.filter((m) => m.id !== messageId)
    })),

  clearMessages: () => set({ messages: [], hasMore: true, replyingTo: null, pinnedMessages: [], showPinnedPanel: false, highlightedMessageId: null, isJumpedState: false, editingMessageId: null }),

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
  },

  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),

  setEditingMessageId: (id) => set({ editingMessageId: id }),

  editMessage: async (messageId, content) => {
    try {
      const updated = await messagesApi.update(messageId, content)
      get().updateMessage(updated)
      set({ editingMessageId: null })
    } catch {
      // ignore
    }
  },

  deleteMessage: async (messageId) => {
    try {
      await messagesApi.delete(messageId)
      get().removeMessage(messageId)
    } catch {
      // ignore
    }
  },

  updateMessagePoll: (messageId, poll) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, poll } : m
      )
    }))
}))
