import { create } from 'zustand'
import type { Message } from '@/types/models'
import { messages as messagesApi } from '@/services/api'

interface MessageState {
  messages: Message[]
  isLoading: boolean
  hasMore: boolean

  fetchMessages: (channelId: string, before?: string) => Promise<void>
  sendMessage: (channelId: string, content: string) => Promise<void>
  addMessage: (message: Message) => void
  updateMessage: (message: Message) => void
  removeMessage: (messageId: string) => void
  clearMessages: () => void
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  isLoading: false,
  hasMore: true,

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

  sendMessage: async (channelId, content) => {
    await messagesApi.send(channelId, { content })
  },

  addMessage: (message) =>
    set((state) => ({ messages: [message, ...state.messages] })),

  updateMessage: (message) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === message.id ? message : m))
    })),

  removeMessage: (messageId) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId)
    })),

  clearMessages: () => set({ messages: [], hasMore: true })
}))
