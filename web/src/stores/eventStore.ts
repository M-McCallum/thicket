import { create } from 'zustand'
import type { ServerEvent } from '@/types/models'
import { events as eventsApi } from '@/services/api'

interface EventState {
  events: ServerEvent[]
  isLoading: boolean
  error: string | null

  fetchEvents: (serverId: string) => Promise<void>
  addEvent: (event: ServerEvent) => void
  updateEvent: (event: ServerEvent) => void
  removeEvent: (eventId: string) => void
  rsvp: (serverId: string, eventId: string, status: string) => Promise<void>
  removeRsvp: (serverId: string, eventId: string) => Promise<void>
  clearEvents: () => void
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  isLoading: false,
  error: null,

  fetchEvents: async (serverId: string) => {
    set({ isLoading: true, error: null })
    try {
      const events = await eventsApi.list(serverId)
      set({ events, isLoading: false })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  addEvent: (event: ServerEvent) => {
    set((state) => ({
      events: [...state.events, event].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
    }))
  },

  updateEvent: (event: ServerEvent) => {
    set((state) => ({
      events: state.events.map((e) => (e.id === event.id ? event : e))
    }))
  },

  removeEvent: (eventId: string) => {
    set((state) => ({
      events: state.events.filter((e) => e.id !== eventId)
    }))
  },

  rsvp: async (serverId: string, eventId: string, status: string) => {
    try {
      await eventsApi.rsvp(serverId, eventId, status)
      // Optimistically update local state
      set((state) => ({
        events: state.events.map((e) => {
          if (e.id !== eventId) return e
          const wasRsvpd = e.user_rsvp !== null
          return {
            ...e,
            user_rsvp: status,
            interested_count: wasRsvpd ? e.interested_count : e.interested_count + 1
          }
        })
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  removeRsvp: async (serverId: string, eventId: string) => {
    try {
      await eventsApi.removeRsvp(serverId, eventId)
      set((state) => ({
        events: state.events.map((e) => {
          if (e.id !== eventId) return e
          return {
            ...e,
            user_rsvp: null,
            interested_count: Math.max(0, e.interested_count - 1)
          }
        })
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  clearEvents: () => {
    set({ events: [], error: null })
  }
}))
