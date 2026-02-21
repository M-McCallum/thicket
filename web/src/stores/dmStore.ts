import { create } from 'zustand'
import type { DMConversationWithParticipants, DMMessage } from '@/types/models'
import { dm as dmApi } from '@/services/api'
import { finalizeUpload } from '@/services/uploadService'

const emptyReactions: DMMessage['reactions'] = []

interface DMState {
  conversations: DMConversationWithParticipants[]
  messages: DMMessage[]
  activeConversationId: string | null
  isLoading: boolean
  hasMore: boolean

  // Reply
  replyingTo: DMMessage | null
  setReplyingTo: (message: DMMessage | null) => void

  // Edit
  editingMessageId: string | null
  setEditingMessageId: (id: string | null) => void
  editMessage: (messageId: string, content: string) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>

  // Reactions
  addReaction: (messageId: string, emoji: string, isMe: boolean) => void
  removeReaction: (messageId: string, emoji: string, isMe: boolean) => void
  toggleReaction: (messageId: string, emoji: string) => void

  // Pins
  pinnedMessages: DMMessage[]
  showPinnedPanel: boolean
  setShowPinnedPanel: (show: boolean) => void
  fetchPinnedMessages: (conversationId: string) => Promise<void>

  fetchConversations: () => Promise<void>
  createConversation: (participantId: string) => Promise<DMConversationWithParticipants>
  createGroupConversation: (participantIds: string[]) => Promise<DMConversationWithParticipants>
  setActiveConversation: (id: string | null) => void
  fetchMessages: (conversationId: string, before?: string) => Promise<void>
  sendMessage: (conversationId: string, content: string, files?: File[], msgType?: string, largePendingIds?: string[]) => Promise<void>
  addMessage: (message: DMMessage) => void
  updateMessage: (update: Partial<DMMessage> & { id: string }) => void
  removeMessage: (messageId: string) => void
  clearMessages: () => void
  addParticipant: (conversationId: string, userId: string) => Promise<void>
  removeParticipant: (conversationId: string, userId: string) => Promise<void>
  renameConversation: (conversationId: string, name: string) => Promise<void>
  updateConversation: (conversationId: string, updates: Partial<DMConversationWithParticipants>) => void
  addConversationParticipant: (conversationId: string, participant: DMConversationWithParticipants['participants'][0]) => void
  removeConversationParticipant: (conversationId: string, userId: string) => void
  acceptRequest: (conversationId: string) => Promise<void>
  declineRequest: (conversationId: string) => Promise<void>
}

export const useDMStore = create<DMState>((set, get) => ({
  conversations: [],
  messages: [],
  activeConversationId: null,
  isLoading: false,
  hasMore: true,
  replyingTo: null,
  editingMessageId: null,
  pinnedMessages: [],
  showPinnedPanel: false,

  setReplyingTo: (message) => set({ replyingTo: message }),
  setEditingMessageId: (id) => set({ editingMessageId: id }),
  setShowPinnedPanel: (show) => set({ showPinnedPanel: show }),

  editMessage: async (messageId, content) => {
    try {
      // Check if the conversation is encrypted
      const msg = get().messages.find((m) => m.id === messageId)
      if (msg) {
        const conv = get().conversations.find((c) => c.id === msg.conversation_id)
        if (conv?.encrypted) {
          const { useE2EEStore } = await import('./e2eeStore')
          const e2ee = useE2EEStore.getState()
          if (e2ee.initialized) {
            content = await e2ee.encrypt(msg.conversation_id, content)
          }
        }
      }
      await dmApi.editMessage(messageId, content)
      set({ editingMessageId: null })
    } catch {
      // ignore
    }
  },

  deleteMessage: async (messageId) => {
    try {
      await dmApi.deleteMessage(messageId)
    } catch {
      // ignore
    }
  },

  addReaction: (messageId, emoji, isMe) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m
        const reactions = m.reactions ?? emptyReactions
        const existing = reactions.find((r) => r.emoji === emoji)
        if (existing) {
          return {
            ...m,
            reactions: reactions.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count + 1, me: r.me || isMe } : r
            )
          }
        }
        return { ...m, reactions: [...reactions, { emoji, count: 1, me: isMe }] }
      })
    })),

  removeReaction: (messageId, emoji, isMe) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m
        const reactions = m.reactions ?? emptyReactions
        return {
          ...m,
          reactions: reactions
            .map((r) =>
              r.emoji === emoji ? { ...r, count: r.count - 1, me: isMe ? false : r.me } : r
            )
            .filter((r) => r.count > 0)
        }
      })
    })),

  toggleReaction: async (messageId, emoji) => {
    const msg = get().messages.find((m) => m.id === messageId)
    const existing = msg?.reactions?.find((r) => r.emoji === emoji)
    try {
      if (existing?.me) {
        await dmApi.removeReaction(messageId, emoji)
      } else {
        await dmApi.addReaction(messageId, emoji)
      }
    } catch {
      // ignore
    }
  },

  fetchPinnedMessages: async (conversationId) => {
    try {
      const pinned = await dmApi.getPinnedMessages(conversationId)
      set({ pinnedMessages: pinned })
    } catch {
      // ignore
    }
  },

  fetchConversations: async () => {
    set({ isLoading: true })
    try {
      const conversations = await dmApi.listConversations()
      set({ conversations, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  createConversation: async (participantId) => {
    const conv = await dmApi.createConversation({ participant_id: participantId })
    const { conversations } = get()
    const exists = conversations.some((c) => c.id === conv.id)
    if (!exists) {
      set({ conversations: [conv, ...conversations] })
    }
    return conv
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  fetchMessages: async (conversationId, before) => {
    set({ isLoading: true })
    try {
      const newMessages = await dmApi.getMessages(conversationId, before, 50)
      set((state) => ({
        messages: before ? [...state.messages, ...newMessages] : newMessages,
        hasMore: newMessages.length === 50,
        isLoading: false
      }))
    } catch {
      set({ isLoading: false })
    }
  },

  sendMessage: async (conversationId, content, files, msgType, largePendingIds) => {
    // Check if conversation is encrypted
    const conv = get().conversations.find((c) => c.id === conversationId)
    if (conv?.encrypted) {
      // Encrypt content before sending via E2EE store
      const { useE2EEStore } = await import('./e2eeStore')
      const e2ee = useE2EEStore.getState()
      if (e2ee.initialized) {
        try {
          content = await e2ee.encrypt(conversationId, content)
        } catch (err) {
          console.error('[E2EE] Encryption failed:', err)
          throw new Error('Failed to encrypt message')
        }
      }
    }
    const msg = await dmApi.sendMessage(conversationId, content, files, msgType)

    // Finalize large file uploads with the new DM message ID
    if (largePendingIds && largePendingIds.length > 0 && msg?.id) {
      await Promise.all(
        largePendingIds.map((id) => finalizeUpload(id, undefined, msg.id).catch(console.error))
      )
    }
  },

  addMessage: (message) =>
    set((state) => ({
      messages: state.messages.some((m) => m.id === message.id)
        ? state.messages
        : [message, ...state.messages]
    })),

  updateMessage: (update) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === update.id ? { ...m, ...update } : m
      )
    })),

  removeMessage: (messageId) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId)
    })),

  clearMessages: () => set({ messages: [], hasMore: true }),

  createGroupConversation: async (participantIds) => {
    const conv = await dmApi.createGroup(participantIds)
    const { conversations } = get()
    const exists = conversations.some((c) => c.id === conv.id)
    if (!exists) {
      set({ conversations: [conv, ...conversations] })
    }
    return conv
  },

  addParticipant: async (conversationId, userId) => {
    await dmApi.addParticipant(conversationId, userId)
  },

  removeParticipant: async (conversationId, userId) => {
    await dmApi.removeParticipant(conversationId, userId)
  },

  renameConversation: async (conversationId, name) => {
    await dmApi.renameConversation(conversationId, name)
  },

  updateConversation: (conversationId, updates) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, ...updates } : c
      )
    })),

  addConversationParticipant: (conversationId, participant) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              participants: c.participants.some((p) => p.id === participant.id)
                ? c.participants
                : [...c.participants, participant]
            }
          : c
      )
    })),

  removeConversationParticipant: (conversationId, userId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, participants: c.participants.filter((p) => p.id !== userId) }
          : c
      )
    })),

  acceptRequest: async (conversationId) => {
    await dmApi.acceptRequest(conversationId)
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, accepted: true } : c
      )
    }))
  },

  declineRequest: async (conversationId) => {
    await dmApi.declineRequest(conversationId)
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== conversationId),
      activeConversationId:
        state.activeConversationId === conversationId ? null : state.activeConversationId
    }))
  }
}))
