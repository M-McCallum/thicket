import { create } from 'zustand'
import type { Thread, ThreadMessage } from '@/types/models'
import { threads as threadsApi } from '@/services/api'

interface ThreadState {
  // Map of parent_message_id -> Thread for quick lookup on messages
  threadsByMessage: Record<string, Thread>
  // Active thread panel
  activeThread: Thread | null
  threadMessages: ThreadMessage[]
  isLoadingMessages: boolean
  isFetchingMore: boolean
  hasMore: boolean

  // Actions
  setThreadsForChannel: (threads: Thread[]) => void
  addThread: (thread: Thread) => void
  updateThread: (thread: Thread) => void
  openThread: (thread: Thread) => void
  closeThread: () => void
  fetchThreadMessages: (threadId: string) => Promise<void>
  fetchMoreThreadMessages: (threadId: string) => Promise<void>
  sendThreadMessage: (threadId: string, content: string) => Promise<void>
  addThreadMessage: (message: ThreadMessage) => void
  updateThreadMessageCount: (threadId: string, parentMessageId: string, count: number) => void
  clearThreads: () => void
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  threadsByMessage: {},
  activeThread: null,
  threadMessages: [],
  isLoadingMessages: false,
  isFetchingMore: false,
  hasMore: true,

  setThreadsForChannel: (threads) => {
    const byMessage: Record<string, Thread> = {}
    for (const t of threads) {
      byMessage[t.parent_message_id] = t
    }
    set({ threadsByMessage: byMessage })
  },

  addThread: (thread) =>
    set((state) => ({
      threadsByMessage: {
        ...state.threadsByMessage,
        [thread.parent_message_id]: thread
      }
    })),

  updateThread: (thread) =>
    set((state) => {
      const updated: Partial<ThreadState> = {
        threadsByMessage: {
          ...state.threadsByMessage,
          [thread.parent_message_id]: thread
        }
      }
      if (state.activeThread?.id === thread.id) {
        updated.activeThread = thread
      }
      return updated
    }),

  openThread: (thread) => {
    set({ activeThread: thread, threadMessages: [], hasMore: true })
    get().fetchThreadMessages(thread.id)
  },

  closeThread: () => set({ activeThread: null, threadMessages: [], hasMore: true }),

  fetchThreadMessages: async (threadId) => {
    set({ isLoadingMessages: true })
    try {
      const msgs = await threadsApi.getMessages(threadId, undefined, 50)
      set({
        threadMessages: msgs,
        hasMore: msgs.length === 50,
        isLoadingMessages: false
      })
    } catch {
      set({ isLoadingMessages: false })
    }
  },

  fetchMoreThreadMessages: async (threadId) => {
    const { threadMessages, isFetchingMore, hasMore } = get()
    if (isFetchingMore || !hasMore || threadMessages.length === 0) return

    set({ isFetchingMore: true })
    try {
      const oldest = threadMessages[threadMessages.length - 1]
      const olderMessages = await threadsApi.getMessages(threadId, oldest.created_at, 50)
      set((state) => ({
        threadMessages: [...state.threadMessages, ...olderMessages],
        hasMore: olderMessages.length === 50,
        isFetchingMore: false
      }))
    } catch {
      set({ isFetchingMore: false })
    }
  },

  sendThreadMessage: async (threadId, content) => {
    await threadsApi.sendMessage(threadId, content)
  },

  addThreadMessage: (message) =>
    set((state) => {
      if (state.activeThread?.id !== message.thread_id) return state
      if (state.threadMessages.some((m) => m.id === message.id)) return state
      return { threadMessages: [message, ...state.threadMessages] }
    }),

  updateThreadMessageCount: (threadId, parentMessageId, count) =>
    set((state) => {
      const existing = state.threadsByMessage[parentMessageId]
      if (!existing || existing.id !== threadId) return state
      return {
        threadsByMessage: {
          ...state.threadsByMessage,
          [parentMessageId]: { ...existing, message_count: count }
        }
      }
    }),

  clearThreads: () => set({
    threadsByMessage: {},
    activeThread: null,
    threadMessages: [],
    hasMore: true
  })
}))
