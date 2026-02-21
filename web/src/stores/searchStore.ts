import { create } from 'zustand'
import type { Message } from '@/types/models'
import { search } from '@/services/api'

export interface SearchFilters {
  author_id?: string
  has_attachment?: boolean
  has_link?: boolean
  date_from?: string
  date_to?: string
}

interface SearchState {
  isOpen: boolean
  query: string
  results: Message[]
  isSearching: boolean
  hasMore: boolean
  scope: 'channel' | 'server' | 'all'
  filters: SearchFilters

  setOpen: (open: boolean) => void
  setQuery: (query: string) => void
  setScope: (scope: 'channel' | 'server' | 'all') => void
  setFilters: (filters: SearchFilters) => void
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
  filters: {},

  setOpen: (open) => set({ isOpen: open }),
  setQuery: (query) => set({ query }),
  setScope: (scope) => set({ scope }),
  setFilters: (filters) => set({ filters }),

  performSearch: async (channelId, serverId) => {
    const { query, scope, filters } = get()
    if (!query.trim()) {
      set({ results: [], hasMore: false })
      return
    }

    set({ isSearching: true })
    try {
      const activeFilters = Object.keys(filters).length > 0 ? filters : undefined
      const results = await search.messages(
        query,
        scope === 'channel' ? channelId : undefined,
        scope === 'server' ? serverId : undefined,
        undefined,
        25,
        activeFilters
      )
      set({ results, hasMore: results.length === 25, isSearching: false })
    } catch {
      set({ isSearching: false })
    }
  },

  loadMore: async (channelId, serverId) => {
    const { query, scope, results, hasMore, isSearching, filters } = get()
    if (!hasMore || isSearching || results.length === 0) return

    set({ isSearching: true })
    const lastResult = results[results.length - 1]
    try {
      const activeFilters = Object.keys(filters).length > 0 ? filters : undefined
      const more = await search.messages(
        query,
        scope === 'channel' ? channelId : undefined,
        scope === 'server' ? serverId : undefined,
        lastResult.created_at,
        25,
        activeFilters
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

  clear: () => set({ query: '', results: [], hasMore: false, isSearching: false, filters: {} })
}))
