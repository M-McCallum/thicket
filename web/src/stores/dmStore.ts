import { create } from 'zustand'
import type { DMConversationWithParticipants, DMMessage } from '@/types/models'
import { dm as dmApi } from '@/services/api'

interface DMState {
  conversations: DMConversationWithParticipants[]
  messages: DMMessage[]
  activeConversationId: string | null
  isLoading: boolean
  hasMore: boolean

  fetchConversations: () => Promise<void>
  createConversation: (participantId: string) => Promise<DMConversationWithParticipants>
  setActiveConversation: (id: string | null) => void
  fetchMessages: (conversationId: string, before?: string) => Promise<void>
  sendMessage: (conversationId: string, content: string) => Promise<void>
  addMessage: (message: DMMessage) => void
  clearMessages: () => void
}

export const useDMStore = create<DMState>((set, get) => ({
  conversations: [],
  messages: [],
  activeConversationId: null,
  isLoading: false,
  hasMore: true,

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

  sendMessage: async (conversationId, content) => {
    await dmApi.sendMessage(conversationId, { content })
  },

  addMessage: (message) =>
    set((state) => ({ messages: [message, ...state.messages] })),

  clearMessages: () => set({ messages: [], hasMore: true })
}))
