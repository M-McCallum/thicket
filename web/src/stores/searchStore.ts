import { create } from 'zustand'
import type { Message } from '@/types/models'
import { search } from '@/services/api'

interface SearchState {
  isOpen: boolean
  query: string
  results: Message[]
  isSearching: boolean
  hasMore: boolean
  scope: 'channel' | 'server' | 'all'

  setOpen: (open: boolean) => void
  setQuery: (query: string) => void
  setScope: (scope: 'channel' | 'server' | 'all') => void
  performSearch: (channelId?: string, serverId?: string) => Promise<void>
  loadMore: (channelId?: string, serverId?: string) => Promise<void>
  clear: () => void
}

export const useSearchStore = create<SearchState>((set, get) => ({
  isOpen: false,
  query: '',
  results: [],
  isSearching: false,
  hasMore: false,
  scope: 'channel',

  setOpen: (open) => set({ isOpen: open }),
  setQuery: (query) => set({ query }),
  setScope: (scope) => set({ scope }),

  performSearch: async (channelId, serverId) => {
    const { query, scope } = get()
    if (!query.trim()) {
      set({ results: [], hasMore: false })
      return
    }

    set({ isSearching: true })
    try {
      const results = await search.messages(
        query,
        scope === 'channel' ? channelId : undefined,
        scope === 'server' ? serverId : undefined,
        undefined,
        25
      )
      set({ results, hasMore: results.length === 25, isSearching: false })
    } catch {
      set({ isSearching: false })
    }
  },

  loadMore: async (channelId, serverId) => {
    const { query, scope, results, hasMore, isSearching } = get()
    if (!hasMore || isSearching || results.length === 0) return

    set({ isSearching: true })
    const lastResult = results[results.length - 1]
    try {
      const more = await search.messages(
        query,
        scope === 'channel' ? channelId : undefined,
        scope === 'server' ? serverId : undefined,
        lastResult.created_at,
        25
      )
      set((state) => ({
        results: [...state.results, ...more],
        hasMore: more.length === 25,
        isSearching: false
      }))
    } catch {
      set({ isSearching: false })
    }
  },

  clear: () => set({ query: '', results: [], hasMore: false, isSearching: false })
}))
